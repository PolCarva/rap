// Verifica el motor de rimas con marcas de color en consola (ANSI).
// Uso: node scripts/test-rhyme.mjs
import { analyzeRhymes, syllabify } from "../packages/shared/src/rhyme.ts";

const COLORS = [91, 96, 92, 93, 95, 94, 90, 36]; // códigos ANSI fg
const paint = (text, g) => (g === null ? text : `\x1b[1;${COLORS[g % COLORS.length]}m${text}\x1b[0m`);

const examples = [
	"yo soy un rapero, te parto la caja, hoy te dejo en cero, clavo mi navaja",
	"esto es una multisilábica, útil sin avisar, tu ki mi máxima",
	"vengo del barrio sin miedo, con la rima te enredo, prendo fuego y no me quedo",
	"hola que tal como estas todo bien por aca",
	"piensa bien la ciencia, no pierdas la paciencia",
	"tengo berretín, soy ser el king, como perejil, te gano en el free",
];

for (const ex of examples) {
	const segs = analyzeRhymes(ex);
	const rendered = segs.map((s) => paint(s.text, s.group)).join("");
	console.log("\n" + rendered);
	const groups = [...new Set(segs.filter((s) => s.group !== null).map((s) => s.group))];
	console.log(`  grupos: ${groups.length} | ${segs.filter((s) => s.group !== null).map((s) => `[${s.group}:${s.text.trim()}]`).join(" ")}`);
}

console.log("\n--- silabeo de control ---");
for (const w of ["rapero", "caja", "navaja", "multisilábica", "avisar", "máxima", "construir"]) {
	console.log(`  ${w} → ${syllabify(w).join("-")}`);
}
