import {
	analyzeRhymes,
	flattenWordPlan,
	getModality,
	roundStarter,
	turnDurationMs,
	wordsForRole as promptWordsForRole,
	type BattleState,
	type PlayerVerdict,
	type Role,
	type Verdict,
} from "@rap/shared";
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

/** Un MC participó si soltó al menos un verso no vacío. */
function participated(state: BattleState, role: Role): boolean {
	return state.verses[role].some((verse) => verse.trim().length > 0);
}
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

function allRequiredWords(state: BattleState): string[] {
	return state.wordPlan ? flattenWordPlan(state.wordPlan) : state.words;
}

function requiredWordsForRole(state: BattleState, role: Role): string[] {
	const assigned = promptWordsForRole(state.wordPlan, role);
	return assigned.length > 0 ? assigned : state.words;
}

function formatWordPlan(state: BattleState, role: Role): string {
	const batches = state.wordPlan?.[role] ?? [];
	if (batches.length === 0) return requiredWordsForRole(state, role).join(", ");
	return batches.map((batch, index) => `${index + 1}) ${batch.join(", ")}`).join(" | ");
}

/**
 * Juez de freestyle. Si hay OPENROUTER_API_KEY usa un LLM como jurado
 * profesional; si no (o si falla), cae a una heurística para que la batalla
 * siempre cierre.
 */
export async function judgeBattle(state: BattleState, env: Env): Promise<Verdict> {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) return judgeHeuristic(state);
	const hasWords = allRequiredWords(state).length > 0;

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
					"X-Title": "Rapear Online Judge",
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

			return toVerdict(parsed.data, model, hasWords, state.replicaCount, {
				p1: participated(state, "p1"),
				p2: participated(state, "p2"),
			});
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
	didParticipate: { p1: boolean; p2: boolean },
): Verdict {
	// El total se deriva de los criterios (no se confía en el `total` libre del
	// LLM): así las barras y el total siempre coinciden y nadie gana con un
	// total inflado que contradice su desglose. Un MC que no rapeó va a 0 en
	// todo —no puede ganarle a quien sí participó—.
	const norm = (p: z.infer<typeof llmPlayerSchema>, did: boolean) => {
		const criteria = {
			flow: did ? clamp(p.flow ?? 0, 0, 10) : 0,
			rimas: did ? clamp(p.rimas ?? 0, 0, 10) : 0,
			punchlines: did ? clamp(p.punchlines ?? 0, 0, 10) : 0,
			respuesta: did ? clamp(p.respuesta ?? 0, 0, 10) : 0,
			palabras: hasWords ? (did ? clamp(p.palabras ?? 0, 0, 10) : 0) : null,
		};
		return {
			criteria,
			total: did ? totalFromCriteria(criteria, hasWords) : 0,
			comment: did ? (p.comment ?? "") : (p.comment ?? "No rapeó en esta batalla."),
		};
	};
	const p1 = norm(out.p1, didParticipate.p1);
	const p2 = norm(out.p2, didParticipate.p2);

	const outcome = votesFromDetail(p1, p2, replicaCount);

	return {
		winner: outcome.winner,
		scores: { p1: p1.total, p2: p2.total },
		judges: outcome.judges,
		rationale: out.rationale,
		detail: { p1, p2 },
		model,
	};
}

/**
 * Perfiles de los tres jueces: cada uno pondera distinto los criterios, como
 * un jurado real. El voto dividido sale de una lectura genuina del desglose
 * (un juez "técnico" puede preferir al de mejores rimas aunque pierda en
 * total), no de un disenso fabricado.
 */
const JUDGE_PROFILES: Record<keyof PlayerVerdict["criteria"], number>[] = [
	// Juez 1 — técnico: rimas y flow.
	{ flow: 0.3, rimas: 0.4, punchlines: 0.15, respuesta: 0.05, palabras: 0.1 },
	// Juez 2 — impacto: punchlines y respuesta.
	{ flow: 0.1, rimas: 0.15, punchlines: 0.4, respuesta: 0.25, palabras: 0.1 },
	// Juez 3 — global: balanceado (cercano al total).
	{ flow: 0.25, rimas: 0.25, punchlines: 0.25, respuesta: 0.1, palabras: 0.15 },
];

function profileScore(pv: PlayerVerdict, weights: Record<keyof PlayerVerdict["criteria"], number>): number {
	let sum = 0;
	let totalW = 0;
	for (const key of Object.keys(weights) as (keyof PlayerVerdict["criteria"])[]) {
		const val = pv.criteria[key];
		if (val === null) continue; // criterio no aplica: se renormaliza
		sum += val * weights[key];
		totalW += weights[key];
	}
	return totalW > 0 ? sum / totalW : 0;
}

function votesFromDetail(p1: PlayerVerdict, p2: PlayerVerdict, replicaCount: number): Pick<Verdict, "winner" | "judges"> {
	const diff = Math.abs(p1.total - p2.total);
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

	const winner: Role = p1.total >= p2.total ? "p1" : "p2";
	const votes = JUDGE_PROFILES.map((weights) => {
		const s1 = profileScore(p1, weights);
		const s2 = profileScore(p2, weights);
		// Diferencias mínimas de perfil no alcanzan para disentir del total.
		if (Math.abs(s1 - s2) < 0.35) return { vote: winner, margin: 0 };
		const vote: Role = s1 > s2 ? "p1" : "p2";
		return { vote, margin: Math.abs(s1 - s2) };
	});

	// El ganador por total debe retener la mayoría: si dos perfiles disienten,
	// el de menor margen se alinea (el total manda, el disenso queda en 2-1).
	const dissenters = votes
		.map((v, i) => ({ ...v, i }))
		.filter((v) => v.vote !== winner)
		.sort((a, b) => a.margin - b.margin);
	for (let k = 0; k < dissenters.length - 1; k++) {
		votes[dissenters[k]!.i] = { vote: winner, margin: 0 };
	}

	return {
		winner,
		judges: votes.map((v, i) => ({ judge: i + 1, vote: v.vote })),
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
	const hasWords = allRequiredWords(state).length > 0;

	const weights: Record<string, string> = {
		"4x4": "Es una batalla directa de ida y vuelta: la RESPUESTA (réplica a lo que dijo el rival) y los PUNCHLINES pesan más.",
		"minuto-libre": "Es minuto libre: valorá sobre todo el FLOW y las RIMAS sostenidas, el despliegue y el contenido continuo. No hay réplica directa, así que 'respuesta' importa menos.",
		palabras: "Cada tanda trae palabras que riman entre sí: premiá usarlas dentro del tramo correspondiente, rimarlas entre ellas y no soltarlas como lista mecánica.",
		hard: "El modo Hard cambia palabra cada 5 segundos para cada MC: premiá precisión bajo presión, uso rápido y natural de la palabra activa.",
		easy: "El modo Easy cambia palabra cada 10 segundos para cada MC: premiá integrar cada palabra con sentido, continuidad y buenas rimas.",
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
		`- palabras: ${
			hasWords
				? "qué tan bien usa e integra las palabras/conceptos obligatorios que le tocaron a ESE jugador (y si rima con ellos). No penalices a un MC por palabras asignadas al rival. IMPORTANTE: también valen las REFERENCIAS CONCEPTUALES, no solo la palabra literal — si la palabra es 'gato', cuentan 'siete vidas', 'Allan Poe', 'mala suerte', 'maullar', 'bigotes'; si es 'espejo', cuentan 'reflejo', 'verse la cara', 'el otro yo'. Una alusión ingeniosa al campo semántico vale tanto o más que soltar la palabra suelta sin trabajarla. Abajo va el chequeo literal automático: si una palabra figura como NO usada literalmente, revisá si la referenció antes de puntuar bajo."
				: "esta modalidad NO tiene palabras obligatorias, así que poné palabras: null."
		}`,
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

/** Normaliza para comparar uso literal: minúsculas y sin tildes. */
function normalizeText(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

/** Chequeo literal automático de cada palabra obligatoria en los versos. */
function literalWordUsage(words: string[], verses: string[]): string {
	if (words.length === 0) return "";
	const text = normalizeText(verses.join(" "));
	const parts = words.map((w) => {
		// Para conceptos multi-palabra alcanza con la palabra clave (última).
		const key = normalizeText(w).split(/\s+/).pop()!;
		return `${w}: ${text.includes(key) ? "usada literal" : "NO literal (buscá referencias indirectas)"}`;
	});
	return parts.join("; ");
}

function userPrompt(state: BattleState): string {
	const mod = getModality(state.modality);
	const turnSec = Math.round(turnDurationMs(mod, state.beat?.bpm) / 1000);

	// Transcripción en el orden REAL de los turnos (quién abre alterna por
	// ronda), para que "respuesta" se juzgue sabiendo quién contestó a quién.
	const timeline: string[] = [];
	for (let round = 1; round <= state.totalRounds; round++) {
		const first = roundStarter(round, state.replicaCount);
		const second: Role = first === "p1" ? "p2" : "p1";
		for (const role of [first, second]) {
			const verse = state.verses[role][round - 1];
			if (verse === undefined) continue;
			timeline.push(`Ronda ${round} — ${role} (${state.players[role].name}): ${verse || "(no rapeó)"}`);
		}
	}

	const lines = [
		`Modalidad: ${mod.name} — ${mod.description}`,
		state.wordPlan
			? `Palabras obligatorias por MC: p1 [${formatWordPlan(state, "p1")}]; p2 [${formatWordPlan(state, "p2")}]`
			: `Palabras/conceptos obligatorios: ${state.words.length ? state.words.join(", ") : "ninguna"}`,
		`Estructura: ${state.totalRounds} ronda(s) por jugador, ~${turnSec}s por turno. Quién abre cada ronda alterna.`,
		state.beat ? `Beat: ${state.beat.name}${state.beat.bpm ? ` a ${state.beat.bpm} BPM` : ""} (ambos rapearon sobre la misma pista).` : "Sin beat.",
	];
	if (state.replicaCount > 0) {
		lines.push(`ATENCIÓN: es la réplica n°${state.replicaCount} tras empate; evitá otro empate salvo paridad total.`);
	}
	lines.push("", "Desarrollo de la batalla, en el orden real de los turnos:", ...timeline.map((l) => `  ${l}`));
	for (const role of ["p1", "p2"] as const) {
		lines.push(
			"",
			`Datos objetivos de ${role} (${state.players[role].name}):`,
			`  [análisis fonético: ${rhymeStats(state.verses[role])}]`,
		);
		const assignedWords = requiredWordsForRole(state, role);
		if (assignedWords.length > 0) {
			lines.push(`  [palabras asignadas: ${assignedWords.join(", ")}]`);
			lines.push(`  [chequeo literal de palabras: ${literalWordUsage(assignedWords, state.verses[role])}]`);
		}
	}
	return lines.join("\n");
}

/**
 * Heurística de respaldo (sin IA): cuenta palabras + bonus por usar las
 * palabras de la modalidad. Mantiene la batalla jugable si no hay key o falla.
 */
export function judgeHeuristic(state: BattleState): Verdict {
	const score = (role: Role): number => {
		const verses = state.verses[role];
		const text = normalizeText(verses.join(" "));
		const words = text.split(/\s+/).filter(Boolean);
		let s = words.length;
		for (const w of requiredWordsForRole(state, role)) {
			if (text.includes(normalizeText(w))) s += 10;
		}
		return s;
	};

	const p1 = score("p1");
	const p2 = score("p2");
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
