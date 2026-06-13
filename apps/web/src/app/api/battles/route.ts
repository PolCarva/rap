import { getRecentBattles, parseBattleWords } from "@/lib/data";

// Datos en vivo: nunca cachear, así un estado recién cerrado no queda "pegado"
// (p. ej. una batalla mostrándose "EN CURSO" después de terminar).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const battles = await getRecentBattles(50);
	return Response.json({
		battles: battles.map((battle) => ({
			...battle,
			words: parseBattleWords(battle),
		})),
	});
}
