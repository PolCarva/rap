import { z } from "zod";

/**
 * Avatar de rapero 100% configurable y vectorial (SVG). No guardamos imágenes:
 * solo un pequeño JSON con la combinación elegida, que el cliente y el server
 * renderizan igual. Cada categoría tiene una lista cerrada de opciones con su
 * etiqueta en español para el editor.
 */

export interface AvatarOption {
	id: string;
	/** Etiqueta humana (es) para el editor. */
	label: string;
}

export interface AvatarSwatch extends AvatarOption {
	/** Color base de la opción (para pintar el botón del editor). */
	color: string;
	/** Color secundario opcional (sombra / acento). */
	shade?: string;
}

// ── Tonos de piel ───────────────────────────────────────────────────────────
export const SKIN_TONES: AvatarSwatch[] = [
	{ id: "porcelain", label: "Porcelana", color: "#f4d3bd", shade: "#e0b49a" },
	{ id: "almond", label: "Almendra", color: "#e7b48f", shade: "#cf9870" },
	{ id: "honey", label: "Miel", color: "#d49a6a", shade: "#b87c4d" },
	{ id: "sienna", label: "Siena", color: "#a9663c", shade: "#8a4f2c" },
	{ id: "umber", label: "Umber", color: "#7a4427", shade: "#5e321c" },
	{ id: "espresso", label: "Espresso", color: "#4d2c1a", shade: "#371d10" },
];

// ── Fondos ──────────────────────────────────────────────────────────────────
export const BACKGROUNDS: AvatarSwatch[] = [
	{ id: "crimson", label: "Carmesí", color: "#e8192c", shade: "#7a0c17" },
	{ id: "gold", label: "Oro", color: "#f2b705", shade: "#9c6f00" },
	{ id: "violet", label: "Violeta", color: "#7c3aed", shade: "#3a1772" },
	{ id: "teal", label: "Aguamarina", color: "#0fb8a6", shade: "#06564d" },
	{ id: "azure", label: "Azul", color: "#2563eb", shade: "#10245e" },
	{ id: "charcoal", label: "Carbón", color: "#2b2b33", shade: "#101015" },
	{ id: "graffiti", label: "Graffiti", color: "#ec4899", shade: "#0ea5e9" },
	{ id: "lime", label: "Lima", color: "#84cc16", shade: "#3f6212" },
];

// ── Silueta / estilo base ────────────────────────────────────────────────────
// El campo persistido sigue llamándose `gender` para no romper JSON ya guardado,
// pero las opciones nuevas son descriptivas y no representan identidad.
export const AVATAR_STYLES: AvatarOption[] = [
	{ id: "base", label: "Base" },
	{ id: "defined", label: "Rasgos definidos" },
	{ id: "long", label: "Melena larga" },
	{ id: "mid", label: "Media melena" },
];

/** @deprecated Usar AVATAR_STYLES. Se conserva por compatibilidad de imports. */
export const GENDERS = AVATAR_STYLES;

// ── Forma de la cara ─────────────────────────────────────────────────────────
export const FACE_SHAPES: AvatarOption[] = [
	{ id: "oval", label: "Ovalada" },
	{ id: "round", label: "Redonda" },
	{ id: "square", label: "Cuadrada" },
	{ id: "long", label: "Alargada" },
	{ id: "heart", label: "Corazón" },
];

// ── Tipo de cara (expresión) ─────────────────────────────────────────────────
export const FACE_TYPES: AvatarOption[] = [
	{ id: "chill", label: "Relajado" },
	{ id: "grin", label: "Sonrisa" },
	{ id: "focus", label: "Concentrado" },
	{ id: "fierce", label: "Feroz" },
];

// ── Gorros / cabeza ──────────────────────────────────────────────────────────
export const HATS: AvatarOption[] = [
	{ id: "none", label: "Pelo" },
	{ id: "fade", label: "Fade" },
	{ id: "snapback", label: "Snapback" },
	{ id: "beanie", label: "Gorro" },
	{ id: "bucket", label: "Piluso" },
	{ id: "durag", label: "Durag" },
	{ id: "hood", label: "Capucha" },
	{ id: "crown", label: "Corona" },
];

// ── Lentes ───────────────────────────────────────────────────────────────────
export const GLASSES: AvatarOption[] = [
	{ id: "none", label: "Ninguno" },
	{ id: "shades", label: "Negros" },
	{ id: "round", label: "Redondos" },
	{ id: "shutter", label: "Persiana" },
	{ id: "visor", label: "Visor" },
];

// ── Bigote / barba ───────────────────────────────────────────────────────────
export const FACIAL_HAIR: AvatarOption[] = [
	{ id: "none", label: "Lampiño" },
	{ id: "mustache", label: "Bigote" },
	{ id: "goatee", label: "Candado" },
	{ id: "beard", label: "Barba" },
	{ id: "soulpatch", label: "Mosca" },
];

// ── Collares / cadenas ───────────────────────────────────────────────────────
export const NECKLACES: AvatarOption[] = [
	{ id: "none", label: "Ninguno" },
	{ id: "gold", label: "Cadena de oro" },
	{ id: "dollar", label: "Dólar" },
	{ id: "cross", label: "Cruz" },
	{ id: "pendant", label: "Medalla" },
];

// ── Accesorios ───────────────────────────────────────────────────────────────
export const ACCESSORIES: AvatarOption[] = [
	{ id: "none", label: "Ninguno" },
	{ id: "earring", label: "Aro" },
	{ id: "grillz", label: "Grillz" },
	{ id: "bandana", label: "Bandana" },
	{ id: "headphones", label: "Auriculares" },
];

function idEnum(options: AvatarOption[]): [string, ...string[]] {
	return options.map((o) => o.id) as [string, ...string[]];
}

function normalizeAvatarStyle(input: unknown): unknown {
	if (typeof input !== "string") return input;
	switch (input) {
		case "neutro":
			return "base";
		case "hombre":
			return "defined";
		case "mujer":
			return "long";
		case "androgino":
			return "mid";
		default:
			return input;
	}
}

export const avatarConfigSchema = z.object({
	gender: z.preprocess(normalizeAvatarStyle, z.enum(idEnum(AVATAR_STYLES))).default("base"),
	faceShape: z.enum(idEnum(FACE_SHAPES)).default("oval"),
	skin: z.enum(idEnum(SKIN_TONES)).default("honey"),
	background: z.enum(idEnum(BACKGROUNDS)).default("crimson"),
	face: z.enum(idEnum(FACE_TYPES)).default("chill"),
	hat: z.enum(idEnum(HATS)).default("snapback"),
	glasses: z.enum(idEnum(GLASSES)).default("none"),
	facialHair: z.enum(idEnum(FACIAL_HAIR)).default("none"),
	necklace: z.enum(idEnum(NECKLACES)).default("gold"),
	accessory: z.enum(idEnum(ACCESSORIES)).default("none"),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = avatarConfigSchema.parse({});

/** Parsea de forma tolerante (string JSON, objeto parcial, o null) al config completo. */
export function parseAvatarConfig(input: unknown): AvatarConfig {
	if (input == null) return { ...DEFAULT_AVATAR };
	let raw: unknown = input;
	if (typeof input === "string") {
		const trimmed = input.trim();
		if (!trimmed) return { ...DEFAULT_AVATAR };
		try {
			raw = JSON.parse(trimmed);
		} catch {
			return { ...DEFAULT_AVATAR };
		}
	}
	const parsed = avatarConfigSchema.safeParse(raw);
	return parsed.success ? parsed.data : { ...DEFAULT_AVATAR };
}

/** Genera un avatar pseudo-aleatorio pero determinista a partir de una semilla (id/handle). */
export function avatarFromSeed(seed: string): AvatarConfig {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const pick = <T>(arr: T[], salt: number): T => {
		const n = Math.abs((h ^ Math.imul(salt + 1, 2654435761)) >>> 0);
		return arr[n % arr.length];
	};
	const gender = pick(AVATAR_STYLES, 9).id as AvatarConfig["gender"];
	return {
		gender,
		faceShape: pick(FACE_SHAPES, 10).id as AvatarConfig["faceShape"],
		skin: pick(SKIN_TONES, 1).id as AvatarConfig["skin"],
		background: pick(BACKGROUNDS, 2).id as AvatarConfig["background"],
		face: pick(FACE_TYPES, 3).id as AvatarConfig["face"],
		hat: pick(HATS.filter((h) => h.id !== "none"), 4).id as AvatarConfig["hat"],
		glasses: pick(GLASSES, 5).id as AvatarConfig["glasses"],
		facialHair: pick(FACIAL_HAIR, 6).id as AvatarConfig["facialHair"],
		necklace: pick(NECKLACES, 7).id as AvatarConfig["necklace"],
		accessory: pick(ACCESSORIES, 8).id as AvatarConfig["accessory"],
	};
}
