import type { Env } from "./env";
import { BattleRoom } from "./battle-room";
import { MatchmakingRoom } from "./matchmaking";
import { handleTranscribe } from "./transcribe";

// Las clases Durable Object se exportan desde el entry del Worker.
export { BattleRoom, MatchmakingRoom };

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		if (url.pathname === "/health") {
			return Response.json({ ok: true, service: "rap-realtime" }, { headers: CORS_HEADERS });
		}

		// Transcripción en vivo: proxy de streaming a Deepgram.
		if (url.pathname === "/ws/transcribe") {
			return handleTranscribe(request, env);
		}

		// Matchmaking: un único DO global que mantiene las colas por modalidad.
		if (url.pathname === "/ws/matchmaking") {
			const id = env.MATCHMAKING.idFromName("global");
			return env.MATCHMAKING.get(id).fetch(request);
		}

		// Sala de batalla: un DO por battleId.
		const battle = url.pathname.match(/^\/ws\/battle\/([\w-]+)$/);
		if (battle) {
			const id = env.BATTLE_ROOM.idFromName(battle[1]!);
			return env.BATTLE_ROOM.get(id).fetch(request);
		}

		return new Response("Not found", { status: 404, headers: CORS_HEADERS });
	},
} satisfies ExportedHandler<Env>;
