import { DurableObject } from "cloudflare:workers";
import {
	drawWords,
	getModality,
	mmClientMessageSchema,
	type MmServerMessage,
	type RoomInit,
} from "@rap/shared";
import type { Env } from "./env";

interface MmAttachment {
	name: string;
	modality: string;
	status: "waiting" | "matched";
}

/**
 * Matchmaking DO (singleton). Mantiene una cola implícita: cada WebSocket en
 * espera guarda su modalidad en el attachment del socket (sobrevive a la
 * hibernación). Al llegar un segundo jugador de la misma modalidad, crea la
 * batalla, inicializa su Battle Room DO y avisa a ambos.
 */
export class MatchmakingRoom extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
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

		// Buscar un rival en espera de la misma modalidad.
		const peer = this.ctx.getWebSockets().find((other) => {
			if (other === ws) return false;
			const att = other.deserializeAttachment() as MmAttachment | null;
			return att?.status === "waiting" && att.modality === modality;
		});

		if (!peer) {
			ws.serializeAttachment({ name, modality, status: "waiting" } satisfies MmAttachment);
			return this.send(ws, { kind: "queued", modality });
		}

		// ¡Match! El que esperaba es p1; el recién llegado, p2.
		const peerAtt = peer.deserializeAttachment() as MmAttachment;
		const mod = getModality(modality);
		const words = mod.injectsWords
			? drawWords(mod.wordCount, modality === "deconceptos" ? "concepts" : "words")
			: [];
		const battleId = crypto.randomUUID();

		const init: RoomInit = {
			battleId,
			modality,
			words,
			players: { p1: peerAtt.name, p2: name },
		};

		// Inicializar la sala de batalla antes de avisar a los jugadores.
		const roomId = this.env.BATTLE_ROOM.idFromName(battleId);
		await this.env.BATTLE_ROOM.get(roomId).fetch("https://room/init", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(init),
		});

		this.send(peer, { kind: "matched", battleId, role: "p1", modality, words });
		this.send(ws, { kind: "matched", battleId, role: "p2", modality, words });

		peer.serializeAttachment({ ...peerAtt, status: "matched" } satisfies MmAttachment);
		ws.serializeAttachment({ name, modality, status: "matched" } satisfies MmAttachment);

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
