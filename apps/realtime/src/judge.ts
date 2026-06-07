import type { BattleState, Verdict } from "@rap/shared";

/**
 * Juez PLACEHOLDER — heurística temporal para que el walking skeleton
 * cierre de punta a punta. Se reemplaza en el paso de IA por el juez
 * multimodal (audio + transcripción) con Gemini/GPT-4o.
 */
export function judgePlaceholder(state: BattleState): Verdict {
	const score = (verses: string[]): number => {
		const text = verses.join(" ").toLowerCase();
		const words = text.split(/\s+/).filter(Boolean);
		let s = words.length;
		for (const w of state.words) {
			if (text.includes(w.toLowerCase())) s += 10;
		}
		return s;
	};

	const p1 = score(state.verses.p1);
	const p2 = score(state.verses.p2);
	const winner = p1 === p2 ? "draw" : p1 > p2 ? "p1" : "p2";

	return {
		winner,
		scores: { p1, p2 },
		rationale:
			"Veredicto provisional (heurística placeholder): palabras totales + bonus por uso " +
			"de las palabras de la modalidad. Se reemplaza por el juez IA multimodal.",
	};
}
