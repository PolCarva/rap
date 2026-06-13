import { DurableObject } from "cloudflare:workers";
import { finalizeBattleStatus, recordBattleAbort, recordBattleResult, recordBattleStart, type PersistedIdentity } from "@rap/db";
import {
	countdownMs,
	drawWordsForModality,
	getModality,
	promptBatchesPerTurn,
	roomClientMessageSchema,
	roomInitSchema,
	roundStarter,
	turnDurationMs,
	wordBatchesForRole,
	type BattleState,
	type EloImpact,
	type PlayerIdentity,
	type Role,
	type RoomInit,
	type RoomServerMessage,
} from "@rap/shared";
import type { Env } from "./env";
import { judgeBattle } from "./judge";

const REPLICA_PAUSE_MS = 5200;
/**
 * Gracia tras el deadline del turno antes de registrar verso vacío: cubre la
 * latencia de la transcripción final y de la red, para que el cierre del
 * verso no se pierda por llegar unos cientos de ms tarde.
 */
const VERSE_GRACE_MS = 2500;
/** Tiempo máximo para reconectar antes de perder/abortar por desconexión. */
const DISCONNECT_GRACE_MS = 10_000;
/** TTL del storage del DO una vez terminada la batalla. */
const ROOM_CLEANUP_MS = 15 * 60 * 1000;
/** Delay corto para que el bot no haga avanzar el turno de forma instantánea. */
const BOT_THINK_MS = 1800;

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

function isBotSession(sessionId: string | null | undefined): boolean {
	return sessionId?.startsWith("bot:") ?? false;
}

function opponentOf(role: Role): Role {
	return role === "p1" ? "p2" : "p1";
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
			wordPlan: init.wordPlan ?? null,
			beat: init.beat ?? null,
			phase: "lobby",
			round: 0,
			totalRounds: mod.rounds,
			activeRole: null,
			turnStartedAt: null,
			deadline: null,
			players: {
				p1: { name: p1.name, sessionId: p1.sessionId, userId: p1.userId, isGuest: p1.isGuest, isBot: isBotSession(p1.sessionId), connected: isBotSession(p1.sessionId), ready: isBotSession(p1.sessionId), wantsRematch: false },
				p2: { name: p2.name, sessionId: p2.sessionId, userId: p2.userId, isGuest: p2.isGuest, isBot: isBotSession(p2.sessionId), connected: isBotSession(p2.sessionId), ready: isBotSession(p2.sessionId), wantsRematch: false },
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

	private isTerminal(state: BattleState): boolean {
		return state.phase === "aborted" || (state.phase === "result" && state.verdict?.winner !== "draw");
	}

	private battleHasStarted(state: BattleState): boolean {
		return (
			state.phase === "countdown" ||
			state.phase === "turn" ||
			state.phase === "judging" ||
			(state.phase === "result" && state.verdict?.winner === "draw")
		);
	}

	private disconnectedRoles(state: BattleState): Role[] {
		return (["p1", "p2"] as const).filter((role) => !state.players[role].connected);
	}

	private async disconnectGrace(): Promise<{ until: number; role: Role | null } | null> {
		const until = await this.ctx.storage.get<number>("graceUntil");
		if (!until) return null;
		return {
			until,
			role: (await this.ctx.storage.get<Role>("graceRole")) ?? null,
		};
	}

	private async clearDisconnectGrace(): Promise<void> {
		await this.ctx.storage.delete("graceUntil");
		await this.ctx.storage.delete("graceRole");
	}

	private async beginDisconnectGrace(state: BattleState, role: Role | null): Promise<void> {
		const existing = await this.disconnectGrace();
		if (existing) {
			await this.ctx.storage.setAlarm(existing.until);
			return;
		}
		const until = Date.now() + DISCONNECT_GRACE_MS;
		await this.ctx.storage.put("graceUntil", until);
		if (role) await this.ctx.storage.put("graceRole", role);
		else await this.ctx.storage.delete("graceRole");
		await this.ctx.storage.setAlarm(until);
	}

	private async schedulePhaseAlarm(state: BattleState): Promise<void> {
		const grace = await this.disconnectGrace();
		if (grace) {
			await this.ctx.storage.setAlarm(grace.until);
			return;
		}

		if (this.isTerminal(state)) {
			await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
			return;
		}

		if (state.phase === "turn" && state.activeRole && this.isBotRole(state, state.activeRole)) {
			await this.ctx.storage.setAlarm(Date.now() + BOT_THINK_MS);
			return;
		}

		if ((state.phase === "countdown" || state.phase === "turn" || state.phase === "result") && state.deadline) {
			await this.ctx.storage.setAlarm(Math.max(Date.now(), state.deadline));
			return;
		}

		await this.ctx.storage.deleteAlarm();
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
				slot.isBot = isBotSession(sessionId);
				if (state.phase === "lobby" && state.players.p1.connected && state.players.p2.connected) {
					state.phase = "ready_check";
				}
				await this.setState(state);
				const disconnected = this.disconnectedRoles(state);
				if (disconnected.length === 0) {
					await this.clearDisconnectGrace();
				} else {
					const grace = await this.disconnectGrace();
					if (!grace || grace.role === msg.role) await this.beginDisconnectGrace(state, disconnected[0] ?? null);
				}
				await this.schedulePhaseAlarm(state);
				if (state.phase !== "result" && state.phase !== "aborted") await this.persistStart(state);
				return this.broadcast(state);
			}

			case "ready": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				state.players[att.role].ready = true;
				if (state.phase === "ready_check" && state.players.p1.ready && state.players.p2.ready) {
					state.phase = "countdown";
					state.turnStartedAt = null;
					state.deadline = Date.now() + countdownMs(state.beat?.bpm);
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

			case "rematch": {
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				if (!att) return;
				// Solo tras un veredicto firme (los empates van a réplica automática).
				if (state.phase !== "result" || state.verdict?.winner === "draw") return;
				state.players[att.role].wantsRematch = true;
				const botRole = this.botRole(state);
				if (botRole) state.players[botRole].wantsRematch = true;
				if (state.players.p1.wantsRematch && state.players.p2.wantsRematch) {
					return this.startRematch(state);
				}
				await this.setState(state);
				return this.broadcast(state);
			}

			case "leave": {
				// Si la batalla ya terminó, el veredicto queda intacto para el rival.
				if (state.phase === "result" || state.phase === "aborted") return;
				const att = ws.deserializeAttachment() as RoomAttachment | null;
				await this.ctx.storage.deleteAlarm();
				if (att && this.battleHasStarted(state)) return this.forfeit(state, att.role, "abandono");
				return this.abort(state);
			}
		}
	}

	async alarm(): Promise<void> {
		const state = await this.getState();
		if (!state) return;

		// Batalla terminada: el alarm pendiente es el de limpieza del storage.
		if (this.isTerminal(state)) {
			// Antes de borrar el storage, garantizar que la DB refleje el cierre:
			// si la persistencia del resultado falló, esta es la última red para
			// que la batalla no quede "en curso" eterna.
			await this.ensurePersistedTerminal(state);
			await this.ctx.storage.deleteAll();
			return;
		}

		const grace = await this.disconnectGrace();
		if (grace) {
			const disconnected = this.disconnectedRoles(state);
			if (disconnected.length === 0) {
				await this.clearDisconnectGrace();
				await this.schedulePhaseAlarm(state);
				return;
			}
			if (Date.now() < grace.until) {
				await this.ctx.storage.setAlarm(grace.until);
				return;
			}
			await this.clearDisconnectGrace();
			if (disconnected.length >= 2) return this.abort(state);
			const loser = grace.role && disconnected.includes(grace.role) ? grace.role : disconnected[0]!;
			if (this.battleHasStarted(state)) return this.forfeit(state, loser, "desconexión");
			return this.abort(state);
		}

		// Si ambos se fueron en plena batalla, no tiene sentido seguir.
		if (!state.players.p1.connected && !state.players.p2.connected) {
			return this.abort(state);
		}

		if (state.phase === "countdown") {
			return this.startTurn(state, 1, roundStarter(1, state.replicaCount));
		}

		if (state.phase === "turn" && state.activeRole) {
			if (this.isBotRole(state, state.activeRole)) {
				if (state.verses[state.activeRole].length < state.round) {
					const text = this.botVerse(state, state.activeRole);
					this.broadcastCaption(state.activeRole, text);
					state.verses[state.activeRole].push(text);
					await this.setState(state);
				}
				return this.advance(state);
			}

			// Se acabó el tiempo. Si el verso aún no llegó, dar una gracia corta
			// antes de darlo por vacío: la transcripción final suele llegar unos
			// cientos de ms después del corte.
			if (state.verses[state.activeRole].length < state.round) {
				const graceKey = `${state.replicaCount}:${state.round}:${state.activeRole}`;
				const pending = await this.ctx.storage.get<string>("turnGrace");
				if (pending !== graceKey) {
					await this.ctx.storage.put("turnGrace", graceKey);
					await this.ctx.storage.setAlarm(Date.now() + VERSE_GRACE_MS);
					return;
				}
				state.verses[state.activeRole].push("");
				await this.setState(state);
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
		state.turnStartedAt = null;
		state.deadline = null;
		await this.clearDisconnectGrace();
		await this.ctx.storage.delete("turnGrace");
		await this.setState(state);
		await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
		if (this.env.DB) {
			await recordBattleAbort(this.env.DB, state.battleId).catch((error) => console.warn("recordBattleAbort failed", error));
		}
		return this.broadcast(state);
	}

	private async forfeit(state: BattleState, loser: Role, reason: "abandono" | "desconexión"): Promise<void> {
		const winner = opponentOf(loser);
		const winnerName = state.players[winner].name;
		const loserName = state.players[loser].name;
		state.phase = "result";
		state.activeRole = null;
		state.turnStartedAt = null;
		state.deadline = null;
		state.verdict = {
			winner,
			scores: winner === "p1" ? { p1: 100, p2: 0 } : { p1: 0, p2: 100 },
			judges: [1, 2, 3].map((judge) => ({ judge, vote: winner })),
			rationale: `Victoria de ${winnerName} por ${reason} de ${loserName}.`,
			model: "server-forfeit",
		};
		await this.clearDisconnectGrace();
		await this.ctx.storage.delete("turnGrace");
		await this.setState(state);
		const elo = await this.persistResult(state);
		if (elo && state.verdict) state.verdict = { ...state.verdict, elo };
		await this.setState(state);
		await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
		return this.broadcast(state);
	}

	private async startTurn(state: BattleState, round: number, role: Role): Promise<void> {
		const mod = getModality(state.modality);
		const startedAt = Date.now();
		state.phase = "turn";
		state.round = round;
		state.activeRole = role;
		state.turnStartedAt = startedAt;
		// Duración cuantizada a compases del beat: el corte cae en el 1.
		state.deadline = startedAt + turnDurationMs(mod, state.beat?.bpm);
		await this.setState(state);
		await this.schedulePhaseAlarm(state);
		await this.broadcast(state);
		if (this.isBotRole(state, role)) this.broadcastCaption(role, this.botCaptionPreview(state, role));
		return;
	}

	/** Pasa al siguiente turno (abre/cierra alternado por ronda) o a juicio. */
	private async advance(state: BattleState): Promise<void> {
		const role = state.activeRole;
		const round = state.round;
		await this.ctx.storage.delete("turnGrace");

		const starter = roundStarter(round, state.replicaCount);
		const closer: Role = starter === "p1" ? "p2" : "p1";
		if (role === starter) {
			return this.startTurn(state, round, closer);
		}
		if (role === closer && round < state.totalRounds) {
			return this.startTurn(state, round + 1, roundStarter(round + 1, state.replicaCount));
		}

		// Terminaron todas las rondas → juicio.
		await this.ctx.storage.deleteAlarm();
		state.phase = "judging";
		state.activeRole = null;
		state.turnStartedAt = null;
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
			await this.schedulePhaseAlarm(state);
			return this.broadcast(state);
		}

		const elo = await this.persistResult(state);
		if (elo && state.verdict) state.verdict = { ...state.verdict, elo };
		await this.clearDisconnectGrace();
		await this.setState(state);
		// La sala ya cumplió: limpiar su storage pasado el TTL.
		await this.ctx.storage.setAlarm(Date.now() + ROOM_CLEANUP_MS);
		return this.broadcast(state);
	}

	private async startReplica(state: BattleState): Promise<void> {
		const mod = getModality(state.modality);
		state.replicaCount += 1;
		state.phase = "countdown";
		state.round = 0;
		state.activeRole = null;
		state.turnStartedAt = null;
		state.deadline = Date.now() + countdownMs(state.beat?.bpm);
		state.verses = { p1: [], p2: [] };
		state.verdict = null;
		// Palabras nuevas en la réplica: nadie llega con rimas preparadas.
		if (mod.injectsWords) {
			const prompts = drawWordsForModality(state.modality, state.beat?.bpm);
			state.words = prompts.words;
			state.wordPlan = prompts.wordPlan;
		}
		await this.setState(state);
		await this.schedulePhaseAlarm(state);
		return this.broadcast(state);
	}

	/** Ambos pidieron revancha: misma sala y rival, batalla nueva desde cero. */
	private async startRematch(state: BattleState): Promise<void> {
		const mod = getModality(state.modality);
		state.battleId = crypto.randomUUID();
		const prompts = drawWordsForModality(state.modality, state.beat?.bpm);
		state.words = mod.injectsWords ? prompts.words : [];
		state.wordPlan = mod.injectsWords ? prompts.wordPlan : null;
		state.phase = "ready_check";
		state.round = 0;
		state.activeRole = null;
		state.turnStartedAt = null;
		state.deadline = null;
		state.verses = { p1: [], p2: [] };
		state.verdict = null;
		state.replicaCount = 0;
		for (const role of ["p1", "p2"] as const) {
			state.players[role].ready = state.players[role].isBot;
			state.players[role].wantsRematch = false;
		}
		await this.ctx.storage.deleteAlarm();
		await this.setState(state);
		await this.persistStart(state);
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

		if (!replaced && !this.isTerminal(state) && this.disconnectedRoles(state).length > 0) {
			await this.beginDisconnectGrace(state, att.role);
		}
		await this.broadcast(state);
	}

	private send(ws: WebSocket, msg: RoomServerMessage): void {
		ws.send(JSON.stringify(msg));
	}

	private broadcastCaption(role: Role, text: string): void {
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment() as RoomAttachment | null;
			if (att?.role !== role) this.send(ws, { kind: "caption", role, text });
		}
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

	private botRole(state: BattleState): Role | null {
		if (state.players.p1.isBot) return "p1";
		if (state.players.p2.isBot) return "p2";
		return null;
	}

	private isBotRole(state: BattleState, role: Role): boolean {
		return state.players[role].isBot || isBotSession(state.players[role].sessionId);
	}

	private botWordsForTurn(state: BattleState, role: Role): string[] {
		const batches = wordBatchesForRole(state.wordPlan, role);
		if (batches.length === 0) return state.words;
		const mod = getModality(state.modality);
		const perTurn = promptBatchesPerTurn(mod, state.beat?.bpm);
		const start = Math.max(0, (state.round - 1) * perTurn);
		return batches.slice(start, start + perTurn).flat();
	}

	private botCaptionPreview(state: BattleState, role: Role): string {
		const words = this.botWordsForTurn(state, role).slice(0, 4);
		if (words.length === 0) return "voy entrando al compás, midiendo el terreno";
		return `voy con ${words.join(", ")}`;
	}

	private botVerse(state: BattleState, role: Role): string {
		const words = this.botWordsForTurn(state, role).slice(0, 8);
		if (words.length === 0) {
			return "yo soy un rapero, te parto la caja, hoy te dejo en cero, clavo mi navaja";
		}
		return `entro al beat con ${words.join(", ")}, lo convierto en rima y mantengo la presión`;
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
		const input = {
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
		};
		// `recordBattleResult` corre en un `db.batch` atómico: si falla, no
		// escribió nada, así que reintentar no duplica stats ni ELO.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await recordBattleResult(this.env.DB, input);
			} catch (error) {
				console.warn(`persistResult failed (intento ${attempt + 1}/3)`, error);
			}
		}
		return null;
	}

	/**
	 * Antes de que la sala borre su storage, asegura que la fila de la batalla
	 * quede cerrada en la DB. Idempotente (`WHERE status='active'` en ambas
	 * queries): si el resultado ya se persistió, no hace nada ni recuenta stats.
	 */
	private async ensurePersistedTerminal(state: BattleState): Promise<void> {
		if (!this.env.DB) return;
		try {
			if (state.phase === "aborted") {
				await recordBattleAbort(this.env.DB, state.battleId);
			} else if (state.phase === "result" && state.verdict && state.verdict.winner !== "draw") {
				await finalizeBattleStatus(this.env.DB, state.battleId, {
					winner: state.verdict.winner,
					scoreP1: state.verdict.scores.p1,
					scoreP2: state.verdict.scores.p2,
				});
			}
		} catch (error) {
			console.warn("ensurePersistedTerminal failed", error);
		}
	}
}
