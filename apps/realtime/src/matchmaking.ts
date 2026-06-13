import { DurableObject } from "cloudflare:workers";
import { pickBeat } from "@rap/db";
import {
	DEV_JWT_SECRET,
	drawWordsForModality,
	getSynthBeat,
	isSynthBeatId,
	mmClientMessageSchema,
	randomSynthBeat,
	verifyRealtimeToken,
	type Beat,
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
	status: "init" | "waiting" | "matched";
	allowDevBot?: boolean;
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

		const { modality, name } = parsed;
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

		if (parsed.devBot) {
			if (!currentAtt?.allowDevBot) {
				return this.send(ws, { kind: "error", message: "El bot de prueba solo está disponible en dev local" });
			}

			const beat = await this.resolveBeat(beatId);
			const { words, wordPlan } = drawWordsForModality(modality, beat?.bpm);
			const battleId = crypto.randomUUID();
			const bot = devBotIdentity();
			const init: RoomInit = {
				battleId,
				modality,
				words,
				wordPlan,
				beat,
				players: { p1: identity, p2: bot },
			};

			const roomId = this.env.BATTLE_ROOM.idFromName(battleId);
			await this.env.BATTLE_ROOM.get(roomId).fetch("https://room/init", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(init),
			});

			ws.serializeAttachment({ ...identity, modality, beatId, status: "matched", allowDevBot: currentAtt.allowDevBot } satisfies MmAttachment);
			this.send(ws, { kind: "matched", battleId, role: "p1", modality, words, beat, sessionId: identity.sessionId });
			ws.close(1000, "matched-bot");
			return;
		}

		// Buscar un rival en espera de la misma modalidad. Nunca emparejar a un
		// jugador consigo mismo: ni misma sesión (dos pestañas) ni misma cuenta.
		const peer = this.ctx.getWebSockets().find((other) => {
			if (other === ws) return false;
			const att = other.deserializeAttachment() as MmAttachment | null;
			return (
				att?.status === "waiting" &&
				att.modality === modality &&
				att.sessionId !== undefined &&
				att.sessionId !== identity.sessionId &&
				(!att.userId || att.userId !== identity.userId) &&
				beatsCompatible(att.beatId ?? null, beatId)
			);
		});

		if (!peer) {
			ws.serializeAttachment({ ...identity, modality, beatId, status: "waiting" } satisfies MmAttachment);
			return this.send(ws, { kind: "queued", modality });
		}

		// ¡Match! El que esperaba es p1; el recién llegado, p2.
		const peerAtt = peer.deserializeAttachment() as MmAttachment & Required<Pick<MmAttachment, "name" | "sessionId" | "userId" | "isGuest">>;
		const beat = await this.resolveBeat(selectedBeatId(peerAtt.beatId ?? null, beatId));
		const { words, wordPlan } = drawWordsForModality(modality, beat?.bpm);
		const battleId = crypto.randomUUID();

		const init: RoomInit = {
			battleId,
			modality,
			words,
			wordPlan,
			beat,
			players: { p1: peerAtt, p2: identity },
		};

		// Inicializar la sala de batalla antes de avisar a los jugadores.
		const roomId = this.env.BATTLE_ROOM.idFromName(battleId);
		await this.env.BATTLE_ROOM.get(roomId).fetch("https://room/init", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(init),
		});

		this.send(peer, { kind: "matched", battleId, role: "p1", modality, words, beat, sessionId: peerAtt.sessionId });
		this.send(ws, { kind: "matched", battleId, role: "p2", modality, words, beat, sessionId: identity.sessionId });

		peer.serializeAttachment({ ...peerAtt, status: "matched" } satisfies MmAttachment);
		ws.serializeAttachment({ ...identity, modality, beatId, status: "matched" } satisfies MmAttachment);

		// Los clientes abren un WebSocket nuevo contra el Battle Room DO.
		peer.close(1000, "matched");
		ws.close(1000, "matched");
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		ws.serializeAttachment(null);
	}

	private send(ws: WebSocket, msg: MmServerMessage): void {
		ws.send(JSON.stringify(msg));
	}
}
