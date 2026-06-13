import { getModality, promptBatchesPerTurn, type ModalityId } from "./modalities";

/**
 * Banco de palabras y conceptos para las modalidades que los inyectan.
 * En producción esto vivirá en D1 y podrá curarse por dificultad/tema.
 */
export const WORD_BANK = [
	"laberinto",
	"espejo",
	"tormenta",
	"abismo",
	"semáforo",
	"ceniza",
	"brújula",
	"veneno",
	"eclipse",
	"trinchera",
	"naufragio",
	"engranaje",
	"relámpago",
	"frontera",
	"cicatriz",
	"murmullo",
	"gato",
	"péndulo",
	"asfalto",
	"vértigo",
	"anzuelo",
	"crucigrama",
	"gasolina",
	"telaraña",
	"imán",
	"granizo",
	"sombra",
	"candado",
	"viento",
	"ajedrez",
	"marea",
	"pólvora",
	"sirena",
	"bisturí",
	"martillo",
	"oxígeno",
	"raíz",
	"escalera",
	"fantasma",
	"dinamita",
	"reloj",
	"serpiente",
	"cemento",
	"fósforo",
	"campana",
	"cuchillo",
	"hielo",
	"volcán",
];

export const RHYME_WORD_FAMILIES = [
	["camino", "destino", "latino", "asesino"],
	["fuego", "juego", "ciego", "ego"],
	["calle", "detalle", "estalle", "valle"],
	["arena", "cadena", "condena", "sirena"],
	["mente", "frente", "valiente", "presente"],
	["barrio", "escenario", "diccionario", "adversario"],
	["rima", "cima", "tarima", "estima"],
	["corazón", "razón", "canción", "presión"],
	["vida", "herida", "salida", "caída"],
	["noche", "derroche", "reproche", "coche"],
	["plaza", "amenaza", "raza", "traza"],
	["mundo", "profundo", "segundo", "rotundo"],
	["verdad", "ciudad", "libertad", "ansiedad"],
	["batalla", "muralla", "pantalla", "canalla"],
	["viento", "talento", "momento", "cimiento"],
	["suerte", "muerte", "fuerte", "inerte"],
	["mano", "hermano", "humano", "tirano"],
	["puerta", "alerta", "oferta", "cubierta"],
	["cielo", "hielo", "duelo", "consuelo"],
	["sombra", "asombra", "nombra", "alfombra"],
] as const;

export const CONCEPT_BANK = [
	"el paso del tiempo",
	"la traición",
	"la libertad",
	"el barrio",
	"la ambición",
	"la nostalgia",
	"la rivalidad",
	"el destino",
	"la fama",
	"el miedo",
	"la calle",
	"el dinero",
	"la familia",
	"la venganza",
	"el silencio",
	"la noche",
	"el orgullo",
	"la mentira",
	"el sacrificio",
	"la memoria",
	"el caos",
	"la lealtad",
	"el hambre",
	"la suerte",
];

type PromptRole = "p1" | "p2";

export interface WordPlan {
	p1: string[][];
	p2: string[][];
}

function shuffle<T>(source: readonly T[]): T[] {
	const pool = [...source];
	const out: T[] = [];
	while (pool.length > 0) {
		const idx = Math.floor(Math.random() * pool.length);
		out.push(pool.splice(idx, 1)[0]!);
	}
	return out;
}

function pickRandom<T>(source: readonly T[], count: number): T[] {
	const pool = [...source];
	const out: T[] = [];
	for (let i = 0; i < count && pool.length > 0; i++) {
		const idx = Math.floor(Math.random() * pool.length);
		out.push(pool.splice(idx, 1)[0]!);
	}
	return out;
}

function pickUniqueWords(source: readonly string[], count: number, used: Set<string>): string[] {
	const out: string[] = [];
	for (const word of shuffle(source)) {
		const key = word.toLowerCase();
		if (used.has(key)) continue;
		used.add(key);
		out.push(word);
		if (out.length === count) break;
	}
	return out;
}

function drawWordBatches(batchCount: number, batchSize: number): string[][] {
	const used = new Set<string>();
	const batches: string[][] = [];
	for (let i = 0; i < batchCount; i++) {
		batches.push(pickUniqueWords(WORD_BANK, batchSize, used));
	}
	return batches;
}

function drawRhymeBatches(batchCount: number, batchSize: number): string[][] {
	const batches: string[][] = [];
	const families = shuffle(RHYME_WORD_FAMILIES);
	for (let i = 0; i < batchCount && i < families.length; i++) {
		batches.push(pickRandom(families[i]!, batchSize));
	}
	return batches;
}

/** Sortea `count` palabras del banco indicado (palabras o conceptos). */
export function drawWords(count: number, kind: "words" | "concepts" = "words"): string[] {
	return pickRandom(kind === "concepts" ? CONCEPT_BANK : WORD_BANK, count);
}

export function flattenWordPlan(plan: WordPlan | null | undefined): string[] {
	if (!plan) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const batch of [...plan.p1, ...plan.p2]) {
		for (const word of batch) {
			const key = word.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(word);
		}
	}
	return out;
}

export function wordBatchesForRole(plan: WordPlan | null | undefined, role: PromptRole): string[][] {
	return plan?.[role] ?? [];
}

export function wordsForRole(plan: WordPlan | null | undefined, role: PromptRole): string[] {
	return wordBatchesForRole(plan, role).flat();
}

/** Sortea las palabras y, en modos dinámicos, el plan exacto por MC. */
export function drawWordsForModality(
	modality: ModalityId,
	bpm: number | null | undefined,
): { words: string[]; wordPlan: WordPlan | null } {
	const mod = getModality(modality);
	if (!mod.injectsWords) return { words: [], wordPlan: null };

	if (!mod.wordCadence || mod.wordCadence.type === "static") {
		return {
			words: drawWords(mod.wordCount, mod.wordSource === "concepts" ? "concepts" : "words"),
			wordPlan: null,
		};
	}

	const batchesPerRole = mod.rounds * promptBatchesPerTurn(mod, bpm);
	const totalBatches = mod.wordCadence.perRole ? batchesPerRole * 2 : batchesPerRole;
	const batches =
		mod.wordSource === "rhymes"
			? drawRhymeBatches(totalBatches, mod.wordCount)
			: drawWordBatches(totalBatches, mod.wordCount);
	const p1 = batches.slice(0, batchesPerRole);
	const p2 = mod.wordCadence.perRole ? batches.slice(batchesPerRole, batchesPerRole * 2) : p1;
	const wordPlan = { p1, p2 };
	return { words: flattenWordPlan(wordPlan), wordPlan };
}
