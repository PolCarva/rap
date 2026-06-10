import { DurableObject } from "cloudflare:workers";
import { pickBeat } from "@rap/db";
import {
	drawWords,
	getModality,
	mmClientMessageSchema,
	type PlayerIdentity,
	type MmServerMessage,
	type RoomInit,
} from "@rap/shared";
import type { Env } from "./env";

interface MmAttachment {
	name: string;
	sessionId: string;
	userId: string | null;
	isGuest: boolean;
	modality: string;
	beatId: string | null;
	status: "waiting" | "matched";
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

/**
 * Matchmaking DO (singleton). Mantiene una cola implícita: cada WebSocket en
 * espera guarda su modalidad en el attachment del socket (sobrevive a la
 * hibernación). Al llegar un segundo jugador de la misma modalidad, crea la
 * batalla, inicializa su Battle Room DO y avisa a ambos.
 */
export class MatchmakingRoom extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/stats" && request.method === "GET") {
			const sockets = this.ctx.getWebSockets();
			const byModality: Record<string, number> = {};
			let total = 0;
			for (const ws of sockets) {
				const att = ws.deserializeAttachment() as MmAttachment | null;
				if (att?.status === "waiting") {
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

		// Buscar un rival en espera de la misma modalidad.
		const peer = this.ctx.getWebSockets().find((other) => {
			if (other === ws) return false;
			const att = other.deserializeAttachment() as MmAttachment | null;
			return att?.status === "waiting" && att.modality === modality && beatsCompatible(att.beatId, beatId);
		});

		if (!peer) {
			ws.serializeAttachment({ ...identity, modality, beatId, status: "waiting" } satisfies MmAttachment);
			return this.send(ws, { kind: "queued", modality });
		}

		// ¡Match! El que esperaba es p1; el recién llegado, p2.
		const peerAtt = peer.deserializeAttachment() as MmAttachment;
		const mod = getModality(modality);
		const words = mod.injectsWords
			? drawWords(mod.wordCount, modality === "deconceptos" ? "concepts" : "words")
			: [];
		const beat = this.env.DB ? await pickBeat(this.env.DB, selectedBeatId(peerAtt.beatId, beatId)) : null;
		const battleId = crypto.randomUUID();

		const init: RoomInit = {
			battleId,
			modality,
			words,
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
