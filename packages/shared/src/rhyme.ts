/**
 * Análisis de rimas en español, 100% local (sin API). Detecta:
 *  - Rimas de final (asonantes/consonantes): "rap[ero]" / "c[ero]".
 *  - Patrones multisilábicos: secuencias de vocales repetidas (U-I-I-A-I-A).
 * Devuelve segmentos de texto con un id de grupo (color) para colorear las
 * sílabas que riman entre sí. El español ayuda: ortografía casi fonética y
 * solo 5 vocales, así que el silabeo y la tónica salen por reglas.
 */

const ACCENTS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };
const isVowel = (c: string) => "aeiouáéíóúü".includes(c);
const isStrong = (c: string) => "aeoáéó".includes(c);
const isAccentedWeak = (c: string) => "íú".includes(c);
const stripAccent = (c: string) => ACCENTS[c] ?? c;

const DIGRAPHS = ["ch", "ll", "rr"];
const INSEPARABLE = new Set([
	"bl", "cl", "fl", "gl", "pl", "br", "cr", "dr", "fr", "gr", "pr", "tr", "gü",
]);

/** ¿Hay hiato entre dos vocales contiguas (sílabas separadas)? */
function isHiatus(a: string, b: string): boolean {
	if (isStrong(a) && isStrong(b)) return true;
	if (isAccentedWeak(a) || isAccentedWeak(b)) return true;
	return false;
}

/** Separa una palabra (minúscula, solo letras) en sílabas. */
export function syllabify(word: string): string[] {
	const w = word;
	const n = w.length;
	if (n <= 1) return [w];

	// 1) Núcleos vocálicos (rangos de vocales, partiendo hiatos).
	const nuclei: [number, number][] = [];
	let i = 0;
	while (i < n) {
		if (!isVowel(w[i]!)) {
			i++;
			continue;
		}
		let j = i;
		while (j + 1 < n && isVowel(w[j + 1]!) && !isHiatus(w[j]!, w[j + 1]!)) j++;
		nuclei.push([i, j]);
		i = j + 1;
	}
	if (nuclei.length <= 1) return [w];

	// 2) Punto de corte antes de cada núcleo (reparto de consonantes).
	const breaks: number[] = [];
	for (let k = 1; k < nuclei.length; k++) {
		const prevEnd = nuclei[k - 1]![1];
		const curStart = nuclei[k]![0];
		const cs: number[] = [];
		for (let p = prevEnd + 1; p <= curStart - 1; p++) cs.push(p);
		const m = cs.length;

		if (m === 0) breaks.push(curStart);
		else if (m === 1) breaks.push(cs[0]!);
		else {
			const lastTwo = w[cs[m - 2]!]! + w[cs[m - 1]!]!;
			if (DIGRAPHS.includes(lastTwo) || INSEPARABLE.has(lastTwo)) breaks.push(cs[m - 2]!);
			else breaks.push(cs[m - 1]!);
		}
	}

	// 3) Cortar.
	const cuts = [0, ...breaks, n];
	const syls: string[] = [];
	for (let k = 0; k < cuts.length - 1; k++) {
		const s = w.slice(cuts[k]!, cuts[k + 1]!);
		if (s) syls.push(s);
	}
	return syls;
}

/** Índice (0-based) de la sílaba tónica. */
export function stressIndex(syls: string[]): number {
	for (let k = 0; k < syls.length; k++) if (/[áéíóú]/.test(syls[k]!)) return k;
	if (syls.length === 1) return 0;
	const last = syls[syls.length - 1]!;
	const endsVNS = /[aeiouáéíóúns]$/i.test(last);
	return endsVNS ? syls.length - 2 : syls.length - 1;
}

/** Vocal núcleo (base, sin tilde) de una sílaba. */
function nucleusVowel(syl: string): string {
	const vs = [...syl].filter(isVowel);
	if (vs.length === 0) return "";
	const pick = vs.find((c) => "áéíóú".includes(c)) ?? vs.find(isStrong) ?? vs[vs.length - 1]!;
	return stripAccent(pick);
}

/**
 * Offset de la vocal NÚCLEO dentro de la sílaba (donde empieza la rima):
 * la tildada, si no la fuerte, si no la última débil. Saltea el glide del
 * diptongo ("mie" → la 'e', no la 'i") para que "miedo" rime con "edo".
 */
function nucleusOffset(syl: string): number {
	let acc = -1;
	let strong = -1;
	let lastV = -1;
	for (let k = 0; k < syl.length; k++) {
		const c = syl[k]!;
		if (!isVowel(c)) continue;
		lastV = k;
		if (acc < 0 && "áéíóú".includes(c)) acc = k;
		if (strong < 0 && isStrong(c)) strong = k;
	}
	return acc >= 0 ? acc : strong >= 0 ? strong : lastV >= 0 ? lastV : 0;
}

interface Syl {
	vowel: string;
	absStart: number; // inicio de la sílaba en el texto
	absEnd: number;
	nucleusAbs: number; // primer carácter vocálico (donde empieza el color)
}

interface WordInfo {
	start: number; // índice de su primera sílaba (global)
	end: number; // índice exclusivo de su última sílaba
	stress: number; // índice local (dentro de la palabra) de la tónica
	atonic: boolean; // palabra función (no ancla rima)
}

export interface RhymeSegment {
	text: string;
	/** Índice de grupo de rima (color), o null si no rima. */
	group: number | null;
}

const MAX_LEN = 8; // largo máximo de patrón de vocales (multisilábica)
const MIN_MULTI = 3; // sílabas mínimas de una multisilábica (cadenas de palabras completas)

function stripAccents(s: string): string {
	return [...s].map((c) => ACCENTS[c] ?? c).join("");
}

/**
 * Anglicismos frecuentes del freestyle cuya grafía engaña al silabeo español.
 * Mapean a su secuencia de vocales REAL (fonética). Ej: "free" suena "fri" → i.
 * Ampliable.
 */
const LOANWORDS: Record<string, string> = {
	free: "i", beef: "i", beat: "i", weed: "i", street: "i", speech: "i", peace: "i", team: "i",
	flow: "o", show: "o", know: "o", slow: "o", low: "o", crew: "u", true: "u", cool: "u",
	school: "u", money: "oi", game: "ei", fake: "ei", hate: "ei", style: "ai", fire: "ai",
	rhyme: "ai", time: "ai", nice: "ai", like: "ai", life: "ai",
};

/** Palabras átonas (artículos, preposiciones, conjunciones, clíticos): la rima
 * NO aterriza en ellas, así que no anclan una multisilábica corta. */
const ATONIC = new Set([
	"el", "la", "los", "las", "un", "unos", "unas", "lo", "al", "del",
	"de", "a", "en", "con", "sin", "por", "para", "ante", "tras",
	"y", "e", "o", "u", "ni", "que", "si", "como",
	"me", "te", "se", "le", "les", "nos", "os",
	"mi", "tu", "su", "mis", "tus", "sus", "muy", "tan",
]);

/**
 * Normaliza fonéticamente la cola de una rima (de la tónica al final): saltea
 * los glides débiles (la 'i' de "ciencia"), unifica sonidos (c/z→s, v→b, j→x,
 * ll→y, h muda). Así "piensa" y "ciencia" comparten cola "ensa".
 */
function phoneticTail(s: string): string {
	s = s.toLowerCase();
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i]!;
		const next = s[i + 1] ?? "";
		if (isVowel(c)) {
			// Saltear glide débil átono (no la primera vocal = núcleo).
			if (out.length > 0 && "iuü".includes(c)) continue;
			out += stripAccent(c);
		} else if (c === "h") {
			// muda
		} else if (c === "l" && next === "l") {
			out += "y";
			i++;
		} else if (c === "r" && next === "r") {
			out += "r";
			i++;
		} else if (c === "v") out += "b";
		else if (c === "z") out += "s";
		else if (c === "c") out += "eiéí".includes(next) ? "s" : "k";
		else if (c === "q") {
			out += "k";
			if (next === "u") i++;
		} else if (c === "j") out += "x";
		else if (c === "g") out += "eiéí".includes(next) ? "x" : "g";
		else out += c;
	}
	return out;
}

/** Paleta de colores para los grupos de rima (legibles sobre fondo oscuro). */
export const RHYME_COLORS = [
	"#f472b6", "#22d3ee", "#a3e635", "#fbbf24",
	"#c084fc", "#fb7185", "#34d399", "#60a5fa",
];

/**
 * Analiza el texto y devuelve segmentos con grupo de rima. Las sílabas que
 * comparten patrón de vocales (en rima de final o multisilábica) reciben el
 * mismo grupo → el mismo color.
 */
export function analyzeRhymes(text: string): RhymeSegment[] {
	// 1) Sílabas globales (con posiciones absolutas) y palabras.
	const syls: Syl[] = [];
	const words: WordInfo[] = [];
	const wordRe = /[a-záéíóúüñ]+/giu;
	for (const m of text.matchAll(wordRe)) {
		const word = m[0]!;
		const wordStart = m.index!;
		const lower = word.toLowerCase();
		const startSyl = syls.length;
		const loan = LOANWORDS[lower];

		if (loan) {
			// Anglicismo: una sílaba por vocal fonética. La primera cubre toda la
			// palabra (para colorearla entera); las demás van vacías al final.
			for (let vi = 0; vi < loan.length; vi++) {
				const at = vi === 0 ? wordStart : wordStart + word.length;
				syls.push({
					vowel: loan[vi]!,
					absStart: at,
					absEnd: vi === 0 ? wordStart + word.length : at,
					nucleusAbs: at,
				});
			}
			words.push({ start: startSyl, end: syls.length, stress: loan.length - 1, atonic: false });
			continue;
		}

		const parts = syllabify(lower);
		let off = 0;
		for (const p of parts) {
			const absStart = wordStart + off;
			syls.push({
				vowel: nucleusVowel(p),
				absStart,
				absEnd: absStart + p.length,
				nucleusAbs: absStart + nucleusOffset(p),
			});
			off += p.length;
		}
		words.push({ start: startSyl, end: syls.length, stress: stressIndex(parts), atonic: ATONIC.has(lower) });
	}

	const N = syls.length;
	const assigned = new Array<boolean>(N).fill(false);
	const spans: { start: number; end: number; group: number }[] = [];
	const groupOf = new Map<string, number>();
	let nextGroup = 0;
	const groupFor = (key: string) => {
		let g = groupOf.get(key);
		if (g === undefined) groupOf.set(key, (g = nextGroup++));
		return g;
	};

	// 2) PASADA B — Multisilábicas: cadenas de PALABRAS COMPLETAS cuyo patrón de
	// vocales se repite (≥MIN_MULTI sílabas). Alinear a palabra evita el ruido.
	const rangeFree = (a: number, b: number) => {
		for (let k = a; k < b; k++) if (assigned[k]) return false;
		return true;
	};
	// Enumerar spans de palabras contiguas, agrupados por su patrón de vocales.
	// `es` = la cadena termina en sílaba tónica (la rima "aterriza").
	const keySpans = new Map<string, { s: number; e: number; es: boolean }[]>();
	const keyLen = new Map<string, number>();
	for (let wi = 0; wi < words.length; wi++) {
		for (let wj = wi; wj < words.length; wj++) {
			const s = words[wi]!.start;
			const e = words[wj]!.end;
			const len = e - s;
			if (len < MIN_MULTI) continue;
			if (len > MAX_LEN) break;
			const key = syls.slice(s, e).map((x) => x.vowel).join("");
			const es = words[wj]!.start + words[wj]!.stress === e - 1 && !words[wj]!.atonic;
			(keySpans.get(key) ?? keySpans.set(key, []).get(key)!).push({ s, e, es });
			keyLen.set(key, len);
		}
	}
	// Patrones más largos primero (ganan sobre los cortos).
	const keys = [...keySpans.keys()].sort((a, b) => keyLen.get(b)! - keyLen.get(a)!);
	for (const key of keys) {
		const len = keyLen.get(key)!;
		const occ = keySpans.get(key)!.sort((a, b) => a.s - b.s);
		const picked: { s: number; e: number }[] = [];
		let lastEnd = -1;
		for (const o of occ) {
			// Cadenas cortas deben terminar en tónica (descarta ruido tipo
			// "que tal como"/"estas todo"). Las largas (≥5) se permiten igual.
			if (len < 5 && !o.es) continue;
			if (o.s > lastEnd && rangeFree(o.s, o.e)) {
				picked.push(o);
				lastEnd = o.e - 1;
			}
		}
		if (picked.length < 2) continue;
		const group = groupFor(`m:${key}`);
		for (const o of picked) {
			for (let k = o.s; k < o.e; k++) assigned[k] = true;
			spans.push({ start: syls[o.s]!.absStart, end: syls[o.e - 1]!.absEnd, group });
		}
	}

	// 3) PASADA A — Rimas de final: cola de cada palabra (de la tónica al final),
	// dentro de la palabra. Agrupa por cola idéntica (ej. "ero", "aja"; "ejo" NO
	// agrupa con "ero"). Clave de ≥2 caracteres.
	const tailGroups = new Map<string, number[]>();
	for (let wi = 0; wi < words.length; wi++) {
		const w = words[wi]!;
		const tailStart = w.start + w.stress;
		let free = true;
		for (let k = tailStart; k < w.end; k++) if (assigned[k]) free = false;
		if (!free) continue;
		const from = syls[tailStart]!.nucleusAbs;
		const to = syls[w.end - 1]!.absEnd;
		const key = phoneticTail(text.slice(from, to));
		if (key.length < 2) continue;
		(tailGroups.get(key) ?? tailGroups.set(key, []).get(key)!).push(wi);
	}
	for (const [key, wis] of tailGroups) {
		if (wis.length < 2) continue;
		const group = groupFor(`r:${key}`);
		for (const wi of wis) {
			const w = words[wi]!;
			const tailStart = w.start + w.stress;
			for (let k = tailStart; k < w.end; k++) assigned[k] = true;
			spans.push({ start: syls[tailStart]!.nucleusAbs, end: syls[w.end - 1]!.absEnd, group });
		}
	}

	// 4) Mapear color por carácter y emitir segmentos.
	const charGroup = new Array<number | null>(text.length).fill(null);
	for (const sp of spans) {
		for (let c = sp.start; c < sp.end; c++) charGroup[c] = sp.group;
	}

	const out: RhymeSegment[] = [];
	let cur = "";
	let curGroup: number | null = null;
	for (let c = 0; c < text.length; c++) {
		const g = charGroup[c]!;
		if (g !== curGroup) {
			if (cur) out.push({ text: cur, group: curGroup });
			cur = text[c]!;
			curGroup = g;
		} else {
			cur += text[c]!;
		}
	}
	if (cur) out.push({ text: cur, group: curGroup });
	return out;
}
