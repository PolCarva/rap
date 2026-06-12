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
