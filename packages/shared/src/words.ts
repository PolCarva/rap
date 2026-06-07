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
];

export const CONCEPT_BANK = [
	"el paso del tiempo",
	"la traición",
	"la libertad",
	"el barrio",
	"la ambición",
	"la nostalgia",
	"la rivalidad",
	"el destino",
];

function pickRandom<T>(source: readonly T[], count: number): T[] {
	const pool = [...source];
	const out: T[] = [];
	for (let i = 0; i < count && pool.length > 0; i++) {
		const idx = Math.floor(Math.random() * pool.length);
		out.push(pool.splice(idx, 1)[0]!);
	}
	return out;
}

/** Sortea `count` palabras del banco indicado (palabras o conceptos). */
export function drawWords(count: number, kind: "words" | "concepts" = "words"): string[] {
	return pickRandom(kind === "concepts" ? CONCEPT_BANK : WORD_BANK, count);
}
