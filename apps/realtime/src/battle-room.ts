import { DurableObject } from "cloudflare:workers";
import {
	getModality,
	roomClientMessageSchema,
	roomInitSchema,
	type BattleState,
	type Role,
	type RoomInit,
	type RoomServerMessage,
} from "@rap/shared";
import type { Env } from "./env";
import { judgePlaceholder } from "./judge";

const COUNTDOWN_MS = 3000;

interface RoomAttachment {
	role: Role;
	name: string;
}

/**
 * Battle Room DO: una instancia por batalla. Es la ÚNICA fuente de verdad de
 * la máquina de estados (lobby → ready_check → countdown → turnos → judging →
 * result). Los timers de turno y la cuenta atrás se manejan con alarms, de modo
 * que el cronómetro es autoritativo del servidor, no del cliente.
 *
 * El estado se persiste en storage en cada transición para sobrevivir a la
 * hibernación de WebSockets.
 */
export class BattleRoom extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Inicialización interna desde el Matchmaking DO.
		if (request.method === "POST" && url.pathname === "/init") {
			const init = roomInitSchema.parse(await request.json());
			await this.initBattle(init);
			return Response.json({ ok: true });
		}

		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();
			const client = pair[0];
			const server = pair[1];
			this.ctx.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}

		return new Response("Not found", { status: 404 });
	}

	private async initBattle(init: RoomInit): Promise<void> {
		const mod = getModality(init.modality);
		const state: BattleState = {
			battleId: init.battleId,
			modality: init.modality,
			words: init.words,
			phase: "lobby",
			round: 0,
			totalRounds: mod.rounds,
			activeRole: null,
			deadline: null,
			players: {
				p1: { name: init.players.p1, connected: false, ready: false },
				p2: { name: init.players.p2, connected: false, ready: false },
			},
			verses: { p1: [], p2: [] },
			verdict: null,
		};
		await this.setState(state);
	}

	private getState(): Promise<BattleState | undefined> {
		return this.ctx.storage.get<BattleState>("state");
	}

	private async setState(state: BattleState): Promise<void> {
		await this.ctx.storage.put("state", state);
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") return;

		const state = await this.getState();
		if (!state) return this.send(ws, { kind: "error", message: "Sala no inicializada" });

		let msg;
		try {
			msg = roomClientMessageSchema.parse(JSON.parse(message));
		} catch {
			return this.send(ws, { kind: "error", message: "Mensaje de sala inválido" });
		}

		switch (msg.kind) {
			case "hello": {
				ws.serializeAttachment({ role: msg.role, name: msg.name } satisfies RoomAttachment);
				state.players[msg.role].connected = true;
				state.players[msg.role].name = msg.name;
				if (state.phase === "lobby" && state.players.p1.connected && state.players.p2.connected) {
					state.phase = "ready_check";
				}
				await this.setState(state);
				return this.broadcast(state);
			}

			case "ready": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				state.players[att.role].ready = true;
				if (state.phase === "ready_check" && state.players.p1.ready && state.players.p2.ready) {
					state.phase = "countdown";
					state.deadline = Date.now() + COUNTDOWN_MS;
					await this.ctx.storage.setAlarm(state.deadline);
				}
				await this.setState(state);
				return this.broadcast(state);
			}

			case "caption": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				// Retransmitir el caption en vivo al rival.
				for (const peer of this.ctx.getWebSockets()) {
					if (peer === ws) continue;
					this.send(peer, { kind: "caption", role: att.role, text: msg.text });
				}
				return;
			}

			case "verse": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				// Solo el jugador activo, y solo en su turno.
				if (state.phase !== "turn" || state.activeRole !== att.role) return;
				state.verses[att.role].push(msg.text);
				await this.setState(state);
				return this.advance(state);
			}

			case "leave": {
				state.phase = "aborted";
				state.activeRole = null;
				state.deadline = null;
				await this.ctx.storage.deleteAlarm();
				await this.setState(state);
				return this.broadcast(state);
			}
		}
	}

	async alarm(): Promise<void> {
		const state = await this.getState();
		if (!state) return;

		if (state.phase === "countdown") {
			return this.startTurn(state, 1, "p1");
		}

		if (state.phase === "turn" && state.activeRole) {
			// Se acabó el tiempo: si no envió verso esta ronda, registrar uno vacío.
			if (state.verses[state.activeRole].length < state.round) {
				state.verses[state.activeRole].push("");
			}
			return this.advance(state);
		}
	}

	private async startTurn(state: BattleState, round: number, role: Role): Promise<void> {
		const mod = getModality(state.modality);
		state.phase = "turn";
		state.round = round;
		state.activeRole = role;
		state.deadline = Date.now() + mod.turnDurationSec * 1000;
		await this.setState(state);
		await this.ctx.storage.setAlarm(state.deadline);
		return this.broadcast(state);
	}

	/** Pasa al siguiente turno (p1 → p2 → siguiente ronda) o a juicio. */
	private async advance(state: BattleState): Promise<void> {
		const role = state.activeRole;
		const round = state.round;

		if (role === "p1") {
			return this.startTurn(state, round, "p2");
		}
		if (role === "p2" && round < state.totalRounds) {
			return this.startTurn(state, round + 1, "p1");
		}

		// Terminaron todas las rondas → juicio.
		await this.ctx.storage.deleteAlarm();
		state.phase = "judging";
		state.activeRole = null;
		state.deadline = null;
		await this.setState(state);
		await this.broadcast(state);

		// Paso de IA (placeholder por ahora).
		state.verdict = judgePlaceholder(state);
		state.phase = "result";
		await this.setState(state);
		return this.broadcast(state);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const att = ws.deserializeAttachment() as RoomAttachment | null;
		if (!att) return;
		const state = await this.getState();
		if (!state) return;
		state.players[att.role].connected = false;
		await this.setState(state);
		await this.broadcast(state);
	}

	private send(ws: WebSocket, msg: RoomServerMessage): void {
		ws.send(JSON.stringify(msg));
	}

	private async broadcast(state: BattleState): Promise<void> {
		const data = JSON.stringify({ kind: "snapshot", state } satisfies RoomServerMessage);
		for (const ws of this.ctx.getWebSockets()) {
			ws.send(data);
		}
	}
}
