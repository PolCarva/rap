import { analyzeRhymes, getModality, type BattleState, type Role, type Verdict } from "@rap/shared";
import { z } from "zod";
import type { Env } from "./env";

const DEFAULT_MODEL = "openai/gpt-4o";

// --- Forma del JSON que pedimos al modelo (se transforma al Verdict del shared) ---
// Tolerante: el modelo a veces manda null en criterios que no aplican (ej.
// "respuesta" en minuto libre). Normalizamos en toVerdict.
const num = z.number().nullable().optional();
const llmPlayerSchema = z.object({
	flow: num,
	rimas: num,
	punchlines: num,
	respuesta: num,
	palabras: num,
	total: num,
	comment: z.string().optional(),
});
const llmOutputSchema = z.object({
	winner: z.union([z.literal("p1"), z.literal("p2"), z.literal("draw")]),
	rationale: z.string(),
	p1: llmPlayerSchema,
	p2: llmPlayerSchema,
});

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const REPLICA_DIFF = 3;
const UNANIMOUS_DIFF = 14;
const MAX_REPLICAS = 2;

function totalFromCriteria(
	criteria: {
		flow: number;
		rimas: number;
		punchlines: number;
		respuesta: number;
		palabras: number | null;
	},
	hasWords: boolean,
): number {
	const weighted = hasWords
		? criteria.flow * 0.22 +
			criteria.rimas * 0.23 +
			criteria.punchlines * 0.23 +
			criteria.respuesta * 0.14 +
			(criteria.palabras ?? 0) * 0.18
		: criteria.flow * 0.32 +
			criteria.rimas * 0.3 +
			criteria.punchlines * 0.25 +
			criteria.respuesta * 0.13;
	return clamp(Math.round(weighted * 10), 0, 100);
}

function normalizeTotal(rawTotal: number | null | undefined, criteriaTotal: number): number {
	if (rawTotal === null || rawTotal === undefined) return criteriaTotal;
	const scaled = rawTotal <= 10 ? rawTotal * 10 : rawTotal;
	const total = clamp(Math.round(scaled), 0, 100);
	return Math.abs(total - criteriaTotal) > 30 ? criteriaTotal : total;
}

/**
 * Juez de freestyle. Si hay OPENROUTER_API_KEY usa un LLM como jurado
 * profesional; si no (o si falla), cae a una heurística para que la batalla
 * siempre cierre.
 */
export async function judgeBattle(state: BattleState, env: Env): Promise<Verdict> {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) return judgeHeuristic(state);

	const model = env.OPENROUTER_JUDGE_MODEL ?? DEFAULT_MODEL;
	const body = JSON.stringify({
		model,
		temperature: 0.4,
		max_tokens: 900,
		response_format: { type: "json_object" },
		messages: [
			{ role: "system", content: systemPrompt(state) },
			{ role: "user", content: userPrompt(state) },
		],
	});

	// Hasta 2 intentos: las fallas transitorias de red/proveedor no deben tirar
	// al fallback heurístico.
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"X-Title": "Rap Arena Judge",
				},
				body,
				signal: AbortSignal.timeout(25_000),
			});
			if (!res.ok) continue;

			const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
			const content = data.choices?.[0]?.message?.content;
			if (!content) continue;

			const parsed = llmOutputSchema.safeParse(JSON.parse(extractJson(content)));
			if (!parsed.success) continue;

			return toVerdict(parsed.data, model, state.words.length > 0, state.replicaCount);
		} catch {
			/* reintentar */
		}
	}
	return judgeHeuristic(state);
}

function toVerdict(
	out: z.infer<typeof llmOutputSchema>,
	model: string,
	hasWords: boolean,
	replicaCount: number,
): Verdict {
	const norm = (p: z.infer<typeof llmPlayerSchema>) => {
		const criteria = {
			flow: clamp(p.flow ?? 0, 0, 10),
			rimas: clamp(p.rimas ?? 0, 0, 10),
			punchlines: clamp(p.punchlines ?? 0, 0, 10),
			respuesta: clamp(p.respuesta ?? 0, 0, 10),
			palabras: hasWords ? clamp(p.palabras ?? 0, 0, 10) : null,
		};
		const criteriaTotal = totalFromCriteria(criteria, hasWords);
		return {
			criteria,
			total: normalizeTotal(p.total, criteriaTotal),
			comment: p.comment ?? "",
		};
	};
	const p1 = norm(out.p1);
	const p2 = norm(out.p2);

	const outcome = votesFromScores(p1.total, p2.total, replicaCount);

	return {
		winner: outcome.winner,
		scores: { p1: p1.total, p2: p2.total },
		judges: outcome.judges,
		rationale: out.rationale,
		detail: { p1, p2 },
		model,
	};
}

function votesFromScores(p1: number, p2: number, replicaCount: number): Pick<Verdict, "winner" | "judges"> {
	const diff = Math.abs(p1 - p2);
	if (diff <= REPLICA_DIFF && replicaCount < MAX_REPLICAS) {
		return {
			winner: "draw",
			judges: [
				{ judge: 1, vote: "replica" },
				{ judge: 2, vote: "replica" },
				{ judge: 3, vote: "replica" },
			],
		};
	}

	const winner: Role = p1 >= p2 ? "p1" : "p2";
	const loser: Role = winner === "p1" ? "p2" : "p1";
	if (diff >= UNANIMOUS_DIFF) {
		return {
			winner,
			judges: [
				{ judge: 1, vote: winner },
				{ judge: 2, vote: winner },
				{ judge: 3, vote: winner },
			],
		};
	}

	return {
		winner,
		judges: [
			{ judge: 1, vote: winner },
			{ judge: 2, vote: loser },
			{ judge: 3, vote: winner },
		],
	};
}

function extractJson(text: string): string {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced) return fenced[1]!.trim();
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function systemPrompt(state: BattleState): string {
	const mod = getModality(state.modality);
	const hasWords = state.words.length > 0;

	const weights: Record<string, string> = {
		"4x4": "Es una batalla directa de ida y vuelta: la RESPUESTA (réplica a lo que dijo el rival) y los PUNCHLINES pesan más.",
		"minuto-libre": "Es minuto libre: valorá sobre todo el FLOW y las RIMAS sostenidas, el despliegue y el contenido continuo. No hay réplica directa, así que 'respuesta' importa menos.",
		palabras: "El USO de las palabras obligatorias es decisivo: premiá usarlas TODAS, integrarlas con sentido y, sobre todo, rimar o construir punchlines alrededor de ellas. Penalizá las que no use.",
		deconceptos: "Premiá el DESARROLLO y el hilado de los conceptos dados: profundidad, coherencia y construir contenido alrededor de ellos.",
	};

	return [
		"Sos un jurado profesional de freestyle (nivel FMS / Red Bull Batalla), criterio técnico, exigente y justo. Hablás en español rioplatense.",
		"Vas a recibir las transcripciones automáticas (speech-to-text) de una batalla. Pueden tener errores menores de transcripción: sé indulgente con esos artefactos y juzgá la intención.",
		"Cada jugador trae un [análisis fonético objetivo] calculado por software (familias de rima y densidad). Usalo como ancla del criterio 'rimas': no premies rimas que el análisis no respalda ni ignores multisilábicas detectadas.",
		"Usá el rango completo de puntajes: un verso flojo merece 2-4, uno sólido 5-7, uno excepcional 8-10. No agrupes todo en 5-7.",
		"",
		"Evaluá a cada jugador en 5 criterios, cada uno de 0 a 10:",
		"- flow: fluidez, cadencia, continuidad y manejo del ritmo (inferido de la estructura y regularidad de los versos).",
		"- rimas: cantidad y calidad; valorá rimas múltiples/compuestas y penalizá las forzadas u obvias.",
		"- punchlines: ingenio, remates, metáforas, doble sentido e impacto.",
		"- respuesta: si contesta/replica lo que dijo el rival.",
		`- palabras: ${hasWords ? "qué tan bien usa e integra las palabras/conceptos obligatorios (y si rima con ellos)." : "esta modalidad NO tiene palabras obligatorias, así que poné palabras: null."}`,
		"",
		`Modalidad: ${mod.name}. ${weights[state.modality] ?? ""}`,
		"",
		"Para CADA criterio poné un número de 0 a 10 (si un criterio aplica poco, igual estimá un número razonable). Usá null SOLO en 'palabras' y solo cuando la modalidad no tiene palabras. Si un jugador no rapeó, asignale valores muy bajos.",
		"Asigná a cada jugador un total de 0 a 100 coherente con sus criterios y la ponderación de la modalidad. Declará winner = el de mayor total; usá 'draw' solo si están realmente parejos.",
		"En 'comment' dale a cada jugador una devolución de una frase. En 'rationale' explicá el fallo en 2-4 frases como un jurado.",
		"",
		"Respondé EXCLUSIVAMENTE un JSON válido con esta forma exacta (sin texto extra, sin markdown):",
		'{"winner":"p1|p2|draw","rationale":"...","p1":{"flow":0-10,"rimas":0-10,"punchlines":0-10,"respuesta":0-10,"palabras":0-10|null,"total":0-100,"comment":"..."},"p2":{...}}',
	].join("\n");
}

/**
 * Métricas objetivas de rima calculadas con el motor fonético local. Le dan al
 * modelo una señal medible para anclar el puntaje de "rimas" (el texto plano
 * de una transcripción no siempre deja obvias las rimas multisilábicas).
 */
function rhymeStats(verses: string[]): string {
	const text = verses.join("\n");
	if (!text.trim()) return "sin datos (no rapeó)";
	const segments = analyzeRhymes(text);
	const groups = new Set<number>();
	let rhymed = 0;
	for (const seg of segments) {
		if (seg.group !== null) {
			groups.add(seg.group);
			rhymed++;
		}
	}
	const wordCount = text.split(/\s+/).filter(Boolean).length;
	return `${wordCount} palabras, ${groups.size} familias de rima detectadas, ${rhymed} segmentos rimados`;
}

function userPrompt(state: BattleState): string {
	const mod = getModality(state.modality);
	const versesOf = (role: Role) =>
		state.verses[role].length > 0
			? state.verses[role].map((v, i) => `  Ronda ${i + 1}: ${v || "(no rapeó)"}`).join("\n")
			: "  (sin versos)";

	const lines = [
		`Modalidad: ${mod.name} — ${mod.description}`,
		`Palabras/conceptos obligatorios: ${state.words.length ? state.words.join(", ") : "ninguna"}`,
		`Estructura: ${state.totalRounds} ronda(s) por jugador, ${mod.turnDurationSec}s por turno.`,
		state.beat ? `Beat: ${state.beat.name}${state.beat.bpm ? ` a ${state.beat.bpm} BPM` : ""} (ambos rapearon sobre la misma pista).` : "Sin beat.",
	];
	if (state.replicaCount > 0) {
		lines.push(`ATENCIÓN: es la réplica n°${state.replicaCount} tras empate; evitá otro empate salvo paridad total.`);
	}
	lines.push(
		"",
		`Jugador p1 = ${state.players.p1.name}:`,
		versesOf("p1"),
		`  [análisis fonético objetivo: ${rhymeStats(state.verses.p1)}]`,
		"",
		`Jugador p2 = ${state.players.p2.name}:`,
		versesOf("p2"),
		`  [análisis fonético objetivo: ${rhymeStats(state.verses.p2)}]`,
	);
	return lines.join("\n");
}

/**
 * Heurística de respaldo (sin IA): cuenta palabras + bonus por usar las
 * palabras de la modalidad. Mantiene la batalla jugable si no hay key o falla.
 */
export function judgeHeuristic(state: BattleState): Verdict {
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
	const outcome = votesFromScores(p1, p2, state.replicaCount);

	return {
		winner: outcome.winner,
		scores: { p1, p2 },
		judges: outcome.judges,
		rationale:
			"Veredicto de respaldo (heurística, sin IA): se contó la cantidad de palabras y el uso " +
			"de las palabras de la modalidad. Configurá OPENROUTER_API_KEY para el juez profesional.",
	};
}
