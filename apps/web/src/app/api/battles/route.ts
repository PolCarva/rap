import { getRecentBattles, parseBattleWords } from "@/lib/data";

export async function GET(): Promise<Response> {
	const battles = await getRecentBattles(50);
	return Response.json({
		battles: battles.map((battle) => ({
			...battle,
			words: parseBattleWords(battle),
		})),
	});
}
