import { DurableObject } from "cloudflare:workers";
import { recordBattleResult, recordBattleStart, type PersistedIdentity } from "@rap/db";
import {
	getModality,
	roomClientMessageSchema,
	roomInitSchema,
	type BattleState,
	type EloImpact,
	type PlayerIdentity,
	type Role,
	type RoomInit,
	type RoomServerMessage,
} from "@rap/shared";
import type { Env } from "./env";
import { judgeBattle } from "./judge";

const COUNTDOWN_MS = 3000;
const REPLICA_PAUSE_MS = 5200;
/** Tiempo que se espera a un jugador desconectado antes de abortar la sala. */
const DISCONNECT_GRACE_MS = 45_000;
/** TTL del storage del DO una vez terminada la batalla. */
const ROOM_CLEANUP_MS = 15 * 60 * 1000;

interface RoomAttachment {
	role: Role;
	name: string;
	sessionId: string;
	userId: string | null;
	isGuest: boolean;
}

function normalizeIdentity(player: string | PlayerIdentity, fallbackName: string): PersistedIdentity {
	if (typeof player === "string") {
		return {
			sessionId: crypto.randomUUID(),
			userId: null,
			name: player || fallbackName,
			isGuest: true,
		};
	}
	return {
		sessionId: player.sessionId,
		userId: player.userId,
		name: player.name,
		isGuest: player.isGuest,
	};
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
		const p1 = normalizeIdentity(init.players.p1, "MC 1");
		const p2 = normalizeIdentity(init.players.p2, "MC 2");
		const state: BattleState = {
			battleId: init.battleId,
			modality: init.modality,
			words: init.words,
			beat: init.beat ?? null,
			phase: "lobby",
			round: 0,
			totalRounds: mod.rounds,
			activeRole: null,
			deadline: null,
			players: {
				p1: { name: p1.name, sessionId: p1.sessionId, userId: p1.userId, isGuest: p1.isGuest, connected: false, ready: false },
				p2: { name: p2.name, sessionId: p2.sessionId, userId: p2.userId, isGuest: p2.isGuest, connected: false, ready: false },
			},
			verses: { p1: [], p2: [] },
			verdict: null,
			replicaCount: 0,
		};
		await this.setState(state);
		await this.persistStart(state);
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
				const slot = state.players[msg.role];
				// Protección del rol: si el slot ya tiene sesión asignada, solo puede
				// volver a entrar quien presente el mismo sessionId (reconexión).
				if (slot.sessionId && msg.sessionId && msg.sessionId !== slot.sessionId) {
					return this.send(ws, { kind: "error", message: "Ese rol ya está ocupado por otro jugador" });
				}
				if (slot.connected && !msg.sessionId) {
					return this.send(ws, { kind: "error", message: "Ese rol ya está conectado" });
				}
				const sessionId = msg.sessionId ?? slot.sessionId ?? crypto.randomUUID();
				// La identidad de cuenta la fijó el matchmaking (verificada por token);
				// el hello no puede escalarla.
				const userId = slot.userId ?? null;
				const isGuest = slot.userId ? slot.isGuest : true;
				ws.serializeAttachment({ role: msg.role, name: msg.name, sessionId, userId, isGuest } satisfies RoomAttachment);
				slot.connected = true;
				slot.name = msg.name;
				slot.sessionId = sessionId;
				slot.userId = userId;
				slot.isGuest = isGuest;
				if (state.phase === "lobby" && state.players.p1.connected && state.players.p2.connected) {
					state.phase = "ready_check";
				}
				// Volvió alguien: cancelar la cuenta regresiva de abandono si estaba corriendo.
				await this.ctx.storage.delete("graceUntil");
				await this.setState(state);
				await this.persistStart(state);
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

			case "signal": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				for (const peer of this.ctx.getWebSockets()) {
					if (peer === ws) continue;
					this.send(peer, { kind: "signal", role: att.role, signal: msg.signal });
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
				// Si la batalla ya terminó, el veredicto queda intacto para el rival.
				if (state.phase === "result" || state.phase === "aborted") return;
				await this.ctx.storage.deleteAlarm();
				return this.abort(state);
			}
		}
	}

	async alarm(): Promise<void> {
		const state = await this.getState();
		if (!state) return;

		// Batalla terminada: el alarm pendiente es el de limpieza del storage.
		if (state.phase === "aborted" || (state.phase === "result" && state.verdict?.winner !== "draw")) {
			await this.ctx.storage.deleteAll();
			return;
		}

		// Sala esperando jugadores: si venció la gracia y alguien sigue
		// desconectado, se aborta para no dejar al rival colgado.
		if (state.phase === "lobby" || state.phase === "ready_check") {
			const graceUntil = await this.ctx.storage.get<number>("graceUntil");
			if (graceUntil && Date.now() >= graceUntil && (!state.players.p1.connected || !state.players.p2.connected)) {
				return this.abort(state);
			}
			return;
		}

		// Si ambos se fueron en plena batalla, no tiene sentido seguir.
		if (!state.players.p1.connected && !state.players.p2.connected) {
			return this.abort(state);
		}

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

		if (state.phase === "result" && state.verdict?.winner === "draw") {
			return this.startReplica(state);
		}
	}

	/** Aborta la batalla y agenda la limpieza del storage. */
	private async abort(state: BattleState): Promise<void> {
		state.phase = "aborted";
		state.activeRole = null;
		state.deadline = null;
		await this.ctx.storage.delete("graceUntil");
		await this.setState(state);
		await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
		return this.broadcast(state);
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

		// Juez IA (con fallback a heurística adentro de judgeBattle).
		const verdict = await judgeBattle(state, this.env);
		state.phase = "result";
		state.verdict = verdict;
		if (verdict.winner === "draw") {
			state.deadline = Date.now() + REPLICA_PAUSE_MS;
			await this.setState(state);
			await this.ctx.storage.setAlarm(state.deadline);
			return this.broadcast(state);
		}

		const elo = await this.persistResult(state);
		if (elo && state.verdict) state.verdict = { ...state.verdict, elo };
		await this.setState(state);
		// La sala ya cumplió: limpiar su storage pasado el TTL.
		await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
		return this.broadcast(state);
	}

	private async startReplica(state: BattleState): Promise<void> {
		state.replicaCount += 1;
		state.phase = "countdown";
		state.round = 0;
		state.activeRole = null;
		state.deadline = Date.now() + COUNTDOWN_MS;
		state.verses = { p1: [], p2: [] };
		state.verdict = null;
		await this.setState(state);
		await this.ctx.storage.setAlarm(state.deadline);
		return this.broadcast(state);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const att = ws.deserializeAttachment() as RoomAttachment | null;
		if (!att) return;
		const state = await this.getState();
		if (!state) return;

		// Reconexión: si otro socket vivo ya tiene este rol, no marcar desconectado.
		const replaced = this.ctx.getWebSockets().some((other) => {
			if (other === ws) return false;
			const otherAtt = other.deserializeAttachment() as RoomAttachment | null;
			return otherAtt?.role === att.role;
		});
		if (!replaced) state.players[att.role].connected = false;
		await this.setState(state);

		// En lobby/ready_check no hay alarm de turno corriendo: armar la cuenta
		// regresiva de abandono. (En countdown/turn el alarm de turno ya chequea.)
		if (
			!replaced &&
			(state.phase === "lobby" || state.phase === "ready_check") &&
			(!state.players.p1.connected || !state.players.p2.connected)
		) {
			const graceUntil = Date.now() + DISCONNECT_GRACE_MS;
			await this.ctx.storage.put("graceUntil", graceUntil);
			await this.ctx.storage.setAlarm(graceUntil);
		}
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

	private identityOf(state: BattleState, role: Role): PersistedIdentity {
		const player = state.players[role];
		return {
			sessionId: player.sessionId ?? `${state.battleId}:${role}`,
			userId: player.userId,
			name: player.name,
			isGuest: player.isGuest,
		};
	}

	private async persistStart(state: BattleState): Promise<void> {
		if (!this.env.DB) return;
		try {
			await recordBattleStart(this.env.DB, {
				id: state.battleId,
				modality: state.modality,
				words: state.words,
				beat: state.beat,
				players: {
					p1: this.identityOf(state, "p1"),
					p2: this.identityOf(state, "p2"),
				},
				startedAt: Date.now(),
			});
		} catch (error) {
			console.warn("persistStart failed", error);
		}
	}

	private async persistResult(state: BattleState): Promise<EloImpact | null> {
		if (!this.env.DB || !state.verdict) return null;
		try {
			return await recordBattleResult(this.env.DB, {
				id: state.battleId,
				modality: state.modality,
				words: state.words,
				beat: state.beat,
				players: {
					p1: this.identityOf(state, "p1"),
					p2: this.identityOf(state, "p2"),
				},
				winner: state.verdict.winner,
				scoreP1: state.verdict.scores.p1,
				scoreP2: state.verdict.scores.p2,
				rationale: state.verdict.rationale,
				model: state.verdict.model,
				detail: { players: state.verdict.detail ?? null, judges: state.verdict.judges },
				verses: state.verses,
				endedAt: Date.now(),
			});
		} catch (error) {
			console.warn("persistResult failed", error);
			return null;
		}
	}
}
