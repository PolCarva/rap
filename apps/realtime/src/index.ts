import { getModalityStats, getProfile, listBattles, listRanking, listUserBattles } from "@rap/db";
import { battleStateSchema } from "@rap/shared";
import type { Env } from "./env";
import { BattleRoom } from "./battle-room";
import { judgeBattle } from "./judge";
import { MatchmakingRoom } from "./matchmaking";
import { handleTranscribe } from "./transcribe";

// Las clases Durable Object se exportan desde el entry del Worker.
export { BattleRoom, MatchmakingRoom };

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

function limitFrom(url: URL, fallback: number, max: number): number {
	const raw = Number(url.searchParams.get("limit") ?? fallback);
	return Number.isFinite(raw) ? Math.max(1, Math.min(max, Math.floor(raw))) : fallback;
}

function json(data: unknown, init?: ResponseInit): Response {
	return Response.json(data, {
		...init,
		headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) },
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		if (url.pathname === "/health") {
			return json({ ok: true, service: "rap-realtime" });
		}

		if (url.pathname === "/ranking") {
			if (!env.DB) return json({ ranking: [] });
			return json({ ranking: await listRanking(env.DB, limitFrom(url, 50, 100)) });
		}

		if (url.pathname === "/battles") {
			if (!env.DB) return json({ battles: [] });
			return json({ battles: await listBattles(env.DB, limitFrom(url, 50, 100)) });
		}

		if (url.pathname === "/profile") {
			if (!env.DB) return json({ profile: null, battles: [], modalityStats: [] });
			const id = url.searchParams.get("id") ?? "";
			if (!id) return json({ error: "Falta id" }, { status: 400 });
			const profile = await getProfile(env.DB, id);
			return json({
				profile,
				battles: profile ? await listUserBattles(env.DB, profile.id, limitFrom(url, 30, 100)) : [],
				modalityStats: profile ? await getModalityStats(env.DB, profile.id) : [],
			});
		}

		// Juez offline: el modo Práctica (un solo dispositivo, sin matchmaking ni
		// salas) arma su BattleState en el cliente y pide el veredicto acá. Reusa
		// el mismo juez IA que las batallas reales; nunca toca D1 ni ELO.
		if (url.pathname === "/judge" && request.method === "POST") {
			let raw: unknown;
			try {
				raw = await request.json();
			} catch {
				return json({ error: "JSON inválido" }, { status: 400 });
			}
			const parsed = battleStateSchema.safeParse(raw);
			if (!parsed.success) {
				return json({ error: "BattleState inválido" }, { status: 400 });
			}
			try {
				const verdict = await judgeBattle(parsed.data, env);
				return json({ verdict });
			} catch {
				return json({ error: "No se pudo evaluar la batalla" }, { status: 502 });
			}
		}

		// Transcripción en vivo: proxy de streaming a Deepgram.
		if (url.pathname === "/ws/transcribe") {
			return handleTranscribe(request, env);
		}

		// Stats: jugadores en cola por modalidad.
		if (url.pathname === "/stats") {
			const id = env.MATCHMAKING.idFromName("global");
			return env.MATCHMAKING.get(id).fetch(request);
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
