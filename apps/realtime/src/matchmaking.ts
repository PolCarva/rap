import { DurableObject } from "cloudflare:workers";
import { getUserById, pickBeat } from "@rap/db";
import {
	DEV_JWT_SECRET,
	drawWordsForModality,
	getSynthBeat,
	isSynthBeatId,
	mmClientMessageSchema,
	randomSynthBeat,
	verifyRealtimeToken,
	type Beat,
	type ModalityId,
	type PlayerIdentity,
	type MmServerMessage,
	type RoomInit,
} from "@rap/shared";
import type { Env } from "./env";

interface MmAttachment {
	name?: string;
	sessionId?: string;
	userId?: string | null;
	isGuest?: boolean;
	modality?: string;
	beatId?: string | null;
	/** El jugador busca batalla competitiva (mueve ELO). */
	ranked?: boolean;
	/** ELO actual del jugador (solo válido en cola ranked). */
	elo?: number;
	/** Epoch ms en que entró a la cola, para ampliar el rango de ELO con la espera. */
	queuedAt?: number;
	status: "init" | "waiting" | "matched";
	allowDevBot?: boolean;
}

/** ELO inicial por defecto, igual al de un usuario recién creado. */
const DEFAULT_ELO = 1000;
/** Diferencia de ELO tolerada apenas un jugador entra a la cola. */
const ELO_WINDOW_START = 100;
/** Cuánto se amplía la ventana de ELO por cada segundo de espera. */
const ELO_WINDOW_PER_SEC = 25;
/** Cada cuánto el alarm reintenta emparejar a los que esperan (amplía la ventana). */
const MATCH_RETRY_MS = 2500;

/**
 * Ventana de ELO aceptada para un jugador que lleva `waitMs` esperando. Crece de
 * forma lineal y sin tope: tras suficiente espera, cualquier rival sirve. Así se
 * prioriza el ELO cercano pero nunca se deja a nadie sin batalla (reglas 3 y 4).
 */
function eloWindow(waitMs: number): number {
	return ELO_WINDOW_START + (ELO_WINDOW_PER_SEC * Math.max(0, waitMs)) / 1000;
}

function identityFromQueue(input: {
	name: string;
	sessionId?: string;
	userId?: string | null;
	isGuest?: boolean;
}): PlayerIdentity {
	return {
		sessionId: input.sessionId ?? crypto.randomUUID(),
		userId: input.userId ?? null,
		name: input.name,
		isGuest: input.isGuest ?? !input.userId,
	};
}

function identityFromAtt(att: MmAttachment): PlayerIdentity {
	return {
		sessionId: att.sessionId ?? crypto.randomUUID(),
		userId: att.userId ?? null,
		name: att.name ?? "MC",
		isGuest: att.isGuest ?? !att.userId,
	};
}

function beatsCompatible(a: string | null, b: string | null): boolean {
	return !a || !b || a === b;
}

function selectedBeatId(waiting: string | null, incoming: string | null): string | null {
	return waiting ?? incoming ?? null;
}

function isDevHost(hostname: string): boolean {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function devBotIdentity(): PlayerIdentity {
	return {
		sessionId: `bot:${crypto.randomUUID()}`,
		userId: null,
		name: "MC Bot",
		isGuest: true,
	};
}

/**
 * Matchmaking DO (singleton). Mantiene una cola implícita: cada WebSocket en
 * espera guarda su modalidad en el attachment del socket (sobrevive a la
 * hibernación). Al llegar un segundo jugador de la misma modalidad, crea la
 * batalla, inicializa su Battle Room DO y avisa a ambos.
 */
export class MatchmakingRoom extends DurableObject<Env> {
	/**
	 * Resuelve el beat de la batalla: synth explícito > beat de la DB >
	 * synth aleatorio. Toda batalla sale con beat.
	 */
	private async resolveBeat(requestedId: string | null): Promise<Beat | null> {
		if (isSynthBeatId(requestedId)) {
			const found = getSynthBeat(requestedId!);
			if (found) return found;
		}
		if (this.env.DB && requestedId && !isSynthBeatId(requestedId)) {
			const fromDb = await pickBeat(this.env.DB, requestedId).catch(() => null);
			if (fromDb) return fromDb;
		}
		if (this.env.DB && !requestedId) {
			const fromDb = await pickBeat(this.env.DB, null).catch(() => null);
			if (fromDb) return fromDb;
		}
		return randomSynthBeat();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/stats" && request.method === "GET") {
			const sockets = this.ctx.getWebSockets();
			const byModality: Record<string, number> = {};
			let total = 0;
			for (const ws of sockets) {
				const att = ws.deserializeAttachment() as MmAttachment | null;
				if (att?.status === "waiting" && att.modality) {
					byModality[att.modality] = (byModality[att.modality] ?? 0) + 1;
					total++;
				}
			}
			return Response.json({ total, byModality }, {
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ status: "init", allowDevBot: isDevHost(url.hostname) } satisfies MmAttachment);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") return;

		let parsed;
		try {
			parsed = mmClientMessageSchema.parse(JSON.parse(message));
		} catch {
			return this.send(ws, { kind: "error", message: "Mensaje de matchmaking inválido" });
		}

		if (parsed.kind === "cancel") {
			ws.serializeAttachment(null);
			ws.close(1000, "cancelled");
			return;
		}

		const { modality } = parsed;
		const identity = identityFromQueue(parsed);
		const beatId = parsed.beatId ?? null;
		const currentAtt = ws.deserializeAttachment() as MmAttachment | null;

		// Modo rankeado: el userId debe venir respaldado por un token firmado por
		// la web. Sin token válido se juega como invitado (no mueve ELO).
		if (identity.userId && !identity.isGuest) {
			const secret = this.env.JWT_SECRET ?? DEV_JWT_SECRET;
			const verified = parsed.authToken ? await verifyRealtimeToken(parsed.authToken, secret) : null;
			if (verified !== identity.userId) {
				identity.userId = null;
				identity.isGuest = true;
			}
		}

		// Modo competitivo: solo se respeta "por ELO" con cuenta verificada. Sin
		// token válido (invitado) la cola es "sin ELO" y nunca se cruzan (regla 2).
		const ranked = (parsed.ranked ?? false) && Boolean(identity.userId) && !identity.isGuest;

		if (parsed.devBot) {
			if (!currentAtt?.allowDevBot) {
				return this.send(ws, { kind: "error", message: "El bot de prueba solo está disponible en dev local" });
			}

			const beat = await this.resolveBeat(beatId);
			const { words, wordPlan } = drawWordsForModality(modality, beat?.bpm);
			const battleId = crypto.randomUUID();
			const bot = devBotIdentity();
			// Una batalla contra el bot nunca mueve ELO: el bot no tiene cuenta.
			const init: RoomInit = {
				battleId,
				modality,
				words,
				wordPlan,
				beat,
				ranked: false,
				players: { p1: identity, p2: bot },
			};

			const roomId = this.env.BATTLE_ROOM.idFromName(battleId);
			await this.env.BATTLE_ROOM.get(roomId).fetch("https://room/init", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(init),
			});

			ws.serializeAttachment({ ...identity, modality, beatId, status: "matched", allowDevBot: currentAtt.allowDevBot } satisfies MmAttachment);
			this.send(ws, { kind: "matched", battleId, role: "p1", modality, words, beat, sessionId: identity.sessionId, ranked: false });
			ws.close(1000, "matched-bot");
			return;
		}

		// ELO del jugador para priorizar rivales cercanos (solo cola "por ELO").
		let elo = DEFAULT_ELO;
		if (ranked && this.env.DB && identity.userId) {
			const user = await getUserById(this.env.DB, identity.userId).catch(() => null);
			if (user) elo = user.elo;
		}

		ws.serializeAttachment({
			...identity,
			modality,
			beatId,
			ranked,
			elo,
			queuedAt: Date.now(),
			status: "waiting",
			allowDevBot: currentAtt?.allowDevBot,
		} satisfies MmAttachment);

		// Intentar emparejar a TODOS los que esperan (incluido este). Devuelve si
		// quedan pares compatibles aún fuera de rango, para reintentar con el alarm.
		const pending = await this.tryMatch();

		// Si este socket no quedó emparejado, sigue en cola: confirmar y, si hay
		// pares pendientes por rango de ELO, agendar el reintento progresivo.
		const after = ws.deserializeAttachment() as MmAttachment | null;
		if (after?.status === "waiting") {
			this.send(ws, { kind: "queued", modality, ranked });
		}
		if (pending) await this.ctx.storage.setAlarm(Date.now() + MATCH_RETRY_MS);
	}

	/** Reintento periódico: amplía la ventana de ELO de los que siguen esperando. */
	async alarm(): Promise<void> {
		const pending = await this.tryMatch();
		if (pending) await this.ctx.storage.setAlarm(Date.now() + MATCH_RETRY_MS);
	}

	/** Dos colas son compatibles si comparten modalidad, beat y tipo (ranked/no). */
	private matchable(a: MmAttachment, b: MmAttachment): boolean {
		return (
			a.status === "waiting" &&
			b.status === "waiting" &&
			a.modality === b.modality &&
			Boolean(a.ranked) === Boolean(b.ranked) &&
			a.sessionId !== undefined &&
			b.sessionId !== undefined &&
			a.sessionId !== b.sessionId &&
			(!a.userId || a.userId !== b.userId) &&
			beatsCompatible(a.beatId ?? null, b.beatId ?? null)
		);
	}

	/**
	 * En cola "por ELO", la diferencia debe entrar en la ventana del que más
	 * esperó (el más paciente acepta rivales más lejanos). Sin ELO no hay límite.
	 */
	private withinWindow(a: MmAttachment, b: MmAttachment, now: number): boolean {
		if (!a.ranked || !b.ranked) return true;
		const diff = Math.abs((a.elo ?? DEFAULT_ELO) - (b.elo ?? DEFAULT_ELO));
		const window = Math.max(eloWindow(now - (a.queuedAt ?? now)), eloWindow(now - (b.queuedAt ?? now)));
		return diff <= window;
	}

	/**
	 * Empareja codiciosamente a los que esperan: en cada paso elige el par
	 * compatible y dentro de rango con MENOR diferencia de ELO (regla 3). Devuelve
	 * true si quedan pares compatibles todavía fuera de rango (regla 4: se
	 * resolverán al ampliarse la ventana en el próximo alarm).
	 */
	private async tryMatch(): Promise<boolean> {
		const now = Date.now();
		const pool = this.ctx
			.getWebSockets()
			.map((ws) => ({ ws, att: ws.deserializeAttachment() as MmAttachment | null }))
			.filter((entry): entry is { ws: WebSocket; att: MmAttachment } => entry.att?.status === "waiting");

		const used = new Set<WebSocket>();
		for (;;) {
			let best: { a: { ws: WebSocket; att: MmAttachment }; b: { ws: WebSocket; att: MmAttachment }; diff: number } | null = null;
			for (let i = 0; i < pool.length; i++) {
				if (used.has(pool[i]!.ws)) continue;
				for (let j = i + 1; j < pool.length; j++) {
					if (used.has(pool[j]!.ws)) continue;
					const a = pool[i]!;
					const b = pool[j]!;
					if (!this.matchable(a.att, b.att)) continue;
					if (!this.withinWindow(a.att, b.att, now)) continue;
					const diff = a.att.ranked
						? Math.abs((a.att.elo ?? DEFAULT_ELO) - (b.att.elo ?? DEFAULT_ELO))
						: 0;
					if (!best || diff < best.diff) best = { a, b, diff };
				}
			}
			if (!best) break;
			used.add(best.a.ws);
			used.add(best.b.ws);
			await this.createBattle(best.a, best.b);
		}

		// ¿Quedan pares compatibles esperando, pero aún fuera de rango de ELO?
		const remaining = pool.filter((entry) => !used.has(entry.ws));
		for (let i = 0; i < remaining.length; i++) {
			for (let j = i + 1; j < remaining.length; j++) {
				if (this.matchable(remaining[i]!.att, remaining[j]!.att)) return true;
			}
		}
		return false;
	}

	/** Crea la batalla entre dos sockets en espera y los cierra. */
	private async createBattle(
		first: { ws: WebSocket; att: MmAttachment },
		second: { ws: WebSocket; att: MmAttachment },
	): Promise<void> {
		// El que lleva más tiempo esperando ocupa p1.
		const [p1, p2] = (first.att.queuedAt ?? 0) <= (second.att.queuedAt ?? 0) ? [first, second] : [second, first];
		const ranked = Boolean(p1.att.ranked && p2.att.ranked);
		const modality = p1.att.modality as ModalityId;
		const beat = await this.resolveBeat(selectedBeatId(p1.att.beatId ?? null, p2.att.beatId ?? null));
		const { words, wordPlan } = drawWordsForModality(modality, beat?.bpm);
		const battleId = crypto.randomUUID();

		const init: RoomInit = {
			battleId,
			modality,
			words,
			wordPlan,
			beat,
			ranked,
			players: { p1: identityFromAtt(p1.att), p2: identityFromAtt(p2.att) },
		};

		const roomId = this.env.BATTLE_ROOM.idFromName(battleId);
		await this.env.BATTLE_ROOM.get(roomId).fetch("https://room/init", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(init),
		});

		this.send(p1.ws, { kind: "matched", battleId, role: "p1", modality, words, beat, sessionId: p1.att.sessionId, ranked });
		this.send(p2.ws, { kind: "matched", battleId, role: "p2", modality, words, beat, sessionId: p2.att.sessionId, ranked });

		p1.ws.serializeAttachment({ ...p1.att, status: "matched" } satisfies MmAttachment);
		p2.ws.serializeAttachment({ ...p2.att, status: "matched" } satisfies MmAttachment);

		// Los clientes abren un WebSocket nuevo contra el Battle Room DO.
		p1.ws.close(1000, "matched");
		p2.ws.close(1000, "matched");
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		ws.serializeAttachment(null);
	}

	private send(ws: WebSocket, msg: MmServerMessage): void {
		ws.send(JSON.stringify(msg));
	}
}
