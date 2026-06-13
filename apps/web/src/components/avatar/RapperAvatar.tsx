import {
	BACKGROUNDS,
	SKIN_TONES,
	parseAvatarConfig,
	type AvatarConfig,
} from "@rap/shared";
import type { ReactNode } from "react";

/**
 * Avatar de rapero 100% vectorial, dibujado por capas a partir de un
 * `AvatarConfig`. Sin <defs> ni ids para poder renderizar muchas instancias
 * (y en RSC) sin colisiones. viewBox fijo 0 0 100 100.
 */

const HAIR = "#1c140d";
const HAIR_HI = "#2c2016";
const OUTLINE = "rgba(0,0,0,0.18)";
const GOLD = "#f2c14e";
const GOLD_DK = "#b07d1d";

function swatch(list: { id: string; color: string; shade?: string }[], id: string) {
	return list.find((s) => s.id === id) ?? list[0];
}

export interface RapperAvatarProps {
	config?: Partial<AvatarConfig> | string | null;
	size?: number;
	className?: string;
	/** Sombra/realce exterior tipo "ficha". */
	ring?: boolean;
	title?: string;
}

export function RapperAvatar({ config, size = 96, className, ring = true, title }: RapperAvatarProps) {
	const cfg = parseAvatarConfig(config ?? undefined);
	const skin = swatch(SKIN_TONES, cfg.skin);
	const skinShade = skin.shade ?? "#b87c4d";
	const bg = swatch(BACKGROUNDS, cfg.background);

	return (
		<svg
			viewBox="0 0 100 100"
			width={size}
			height={size}
			className={className}
			role="img"
			aria-label={title ?? "Avatar de rapero"}
			style={{
				display: "block",
				borderRadius: "50%",
				boxShadow: ring ? "0 0 0 1px rgba(255,255,255,0.14), 0 6px 22px rgba(0,0,0,0.4)" : undefined,
			}}
		>
			<title>{title ?? "Avatar"}</title>

			{/* Fondo */}
			<rect x="0" y="0" width="100" height="100" fill={bg.color} />
			<ellipse cx="50" cy="30" rx="60" ry="42" fill="#ffffff" opacity="0.1" />
			<path d="M0 70 Q50 58 100 70 L100 100 L0 100 Z" fill={bg.shade ?? "#000"} opacity="0.55" />

			{/* Cuello */}
			<rect x="43" y="60" width="14" height="22" rx="6" fill={skinShade} />
			{/* Torso / hombros (remera) */}
			{renderTorso()}

			{/* Pelo largo (detrás de la cabeza) */}
			{renderHairBack(cfg)}

			{/* Orejas */}
			<circle cx="27.5" cy="49" r="5.2" fill={skin.color} stroke={OUTLINE} strokeWidth="0.6" />
			<circle cx="72.5" cy="49" r="5.2" fill={skin.color} stroke={OUTLINE} strokeWidth="0.6" />
			<ellipse cx="27.5" cy="49" rx="2.2" ry="2.8" fill={skinShade} opacity="0.6" />
			<ellipse cx="72.5" cy="49" rx="2.2" ry="2.8" fill={skinShade} opacity="0.6" />
			{renderAccessoryEar(cfg)}

			{/* Cabeza (según forma) */}
			{renderHead(cfg, skin.color)}

			{/* Collar */}
			{renderNecklace(cfg)}

			{/* Vello facial (detrás de boca/nariz) */}
			{renderFacialHair(cfg)}

			{/* Rasgos */}
			{renderFace(cfg, skinShade)}

			{/* Lentes */}
			{renderGlasses(cfg)}

			{/* Pelo / gorro */}
			{renderHat(cfg)}

			{/* Accesorios encima (auriculares, bandana) */}
			{renderAccessoryTop(cfg)}
		</svg>
	);
}

function renderTorso() {
	return (
		<>
			<path d="M18 100 Q19 80 38 76 Q50 73 62 76 Q81 80 82 100 Z" fill="#1d1d24" />
			<path d="M38 76 Q50 73 62 76 L58 82 Q50 79 42 82 Z" fill="#0e0e13" />
		</>
	);
}

// ── Pelo largo / silueta posterior según presentación ────────────────────────
function renderHairBack(cfg: AvatarConfig) {
	if (cfg.gender === "mid") {
		return (
			<path
				d="M24 45 Q22 24 50 22 Q78 24 76 45 Q76 60 70 73 Q66 79 61 75 Q66 60 65 50 Q60 35 50 34 Q40 35 35 50 Q34 60 39 75 Q34 79 30 73 Q24 60 24 45 Z"
				fill={HAIR}
			/>
		);
	}
	if (cfg.gender !== "long") return null;
	return (
		<path
			d="M22 44 Q20 22 50 21 Q80 22 78 44 Q79 65 73 83 Q70 87 65 84 Q71 64 69 50 Q62 33 50 33 Q38 33 31 50 Q29 64 35 84 Q30 87 27 83 Q21 65 22 44 Z"
			fill={HAIR}
		/>
	);
}

// ── Cabeza según forma ───────────────────────────────────────────────────────
function renderHead(cfg: AvatarConfig, skinColor: string) {
	const stroke = OUTLINE;
	let head: ReactNode;
	switch (cfg.faceShape) {
		case "round":
			head = <ellipse cx="50" cy="46" rx="24.5" ry="24.5" fill={skinColor} stroke={stroke} strokeWidth="0.7" />;
			break;
		case "long":
			head = <ellipse cx="50" cy="47" rx="21" ry="28" fill={skinColor} stroke={stroke} strokeWidth="0.7" />;
			break;
		case "square":
			head = (
				<path
					d="M27 34 Q27 21 50 21 Q73 21 73 34 L73 56 Q73 66 64 70 Q50 74 36 70 Q27 66 27 56 Z"
					fill={skinColor}
					stroke={stroke}
					strokeWidth="0.7"
					strokeLinejoin="round"
				/>
			);
			break;
		case "heart":
			head = (
				<path
					d="M26 40 Q24 21 50 20 Q76 21 74 40 Q73 55 62 65 Q56 71 50 72 Q44 71 38 65 Q27 55 26 40 Z"
					fill={skinColor}
					stroke={stroke}
					strokeWidth="0.7"
					strokeLinejoin="round"
				/>
			);
			break;
		default: // oval
			head = <ellipse cx="50" cy="46" rx="23" ry="26" fill={skinColor} stroke={stroke} strokeWidth="0.7" />;
	}
	return (
		<>
			{head}
			<ellipse cx="42" cy="38" rx="8" ry="11" fill="#fff" opacity="0.07" />
		</>
	);
}

// ── Cara ─────────────────────────────────────────────────────────────────────
function renderFace(cfg: AvatarConfig, skinShade: string) {
	const lx = 41.5;
	const rx = 58.5;
	const ey = 45;
	const hasLongSilhouette = cfg.gender === "long";
	const hasMidSilhouette = cfg.gender === "mid";
	const hasDefinedLines = cfg.gender === "defined";
	const lip = hasLongSilhouette ? "#c25069" : hasMidSilhouette ? "#71506f" : hasDefinedLines ? "#2d1013" : "#3a1418";
	// Nariz
	const nose = (
		<path d={`M50 47 Q48.4 53 49 55.5 Q50 56.4 51 55.5 Q51.6 53 50 47`} fill={skinShade} opacity="0.55" />
	);
	const lashes = hasLongSilhouette ? (
		<>
			<path d={`M${lx - 3.2} ${ey - 1.6} l-1.9 -1`} stroke="#1a1a1f" strokeWidth="0.8" strokeLinecap="round" />
			<path d={`M${lx - 3} ${ey - 0.4} l-1.9 -0.2`} stroke="#1a1a1f" strokeWidth="0.7" strokeLinecap="round" />
			<path d={`M${rx + 3.2} ${ey - 1.6} l1.9 -1`} stroke="#1a1a1f" strokeWidth="0.8" strokeLinecap="round" />
			<path d={`M${rx + 3} ${ey - 0.4} l1.9 -0.2`} stroke="#1a1a1f" strokeWidth="0.7" strokeLinecap="round" />
		</>
	) : hasMidSilhouette ? (
		<>
			<path d={`M${lx - 4} ${ey - 1.4} Q${lx} ${ey - 3.1} ${lx + 4} ${ey - 1.4}`} stroke="#1a1a1f" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.85" />
			<path d={`M${rx - 4} ${ey - 1.4} Q${rx} ${ey - 3.1} ${rx + 4} ${ey - 1.4}`} stroke="#1a1a1f" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.85" />
		</>
	) : null;

	let eyes: ReactNode;
	let brows: ReactNode;
	let mouth: ReactNode;

	switch (cfg.face) {
		case "grin":
			eyes = (
				<>
					<path d={`M${lx - 3} ${ey + 1} Q${lx} ${ey - 3} ${lx + 3} ${ey + 1}`} stroke="#1a1a1f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
					<path d={`M${rx - 3} ${ey + 1} Q${rx} ${ey - 3} ${rx + 3} ${ey + 1}`} stroke="#1a1a1f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
				</>
			);
			brows = (
				<>
					<rect x={lx - 3.4} y={ey - 6} width="6.8" height="1.6" rx="0.8" fill={HAIR} />
					<rect x={rx - 3.4} y={ey - 6} width="6.8" height="1.6" rx="0.8" fill={HAIR} />
				</>
			);
			mouth = (
				<>
					<path d="M41 60 Q50 69 59 60 Q50 63 41 60 Z" fill={lip} />
					<path d="M43 60.5 Q50 63.5 57 60.5 Q50 61.6 43 60.5 Z" fill="#fbfbfb" />
				</>
			);
			break;
		case "focus":
			eyes = (
				<>
					<rect x={lx - 3} y={ey - 0.4} width="6" height="2.2" rx="1.1" fill="#1a1a1f" />
					<rect x={rx - 3} y={ey - 0.4} width="6" height="2.2" rx="1.1" fill="#1a1a1f" />
				</>
			);
			brows = (
				<>
					<path d={`M${lx - 3.6} ${ey - 5} L${lx + 3.6} ${ey - 4}`} stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
					<path d={`M${rx + 3.6} ${ey - 5} L${rx - 3.6} ${ey - 4}`} stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
				</>
			);
			mouth = <path d="M43 61.5 Q50 60 57 61.5" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />;
			break;
		case "fierce":
			eyes = (
				<>
					<circle cx={lx} cy={ey} r="2.6" fill="#1a1a1f" />
					<circle cx={rx} cy={ey} r="2.6" fill="#1a1a1f" />
				</>
			);
			brows = (
				<>
					<path d={`M${lx - 4} ${ey - 6.5} L${lx + 4} ${ey - 3.5}`} stroke={HAIR} strokeWidth="2.4" strokeLinecap="round" />
					<path d={`M${rx + 4} ${ey - 6.5} L${rx - 4} ${ey - 3.5}`} stroke={HAIR} strokeWidth="2.4" strokeLinecap="round" />
				</>
			);
			mouth = (
				<>
					<path d="M42 59 Q50 57 58 59 Q56 66 50 66.5 Q44 66 42 59 Z" fill={lip} />
					<path d="M44.5 59.6 Q50 58.6 55.5 59.6 Q50 60.8 44.5 59.6 Z" fill="#fbfbfb" />
				</>
			);
			break;
		default: // chill
			eyes = (
				<>
					<ellipse cx={lx} cy={ey} rx="2.4" ry="2.9" fill="#1a1a1f" />
					<ellipse cx={rx} cy={ey} rx="2.4" ry="2.9" fill="#1a1a1f" />
					<circle cx={lx + 0.8} cy={ey - 0.9} r="0.7" fill="#fff" opacity="0.85" />
					<circle cx={rx + 0.8} cy={ey - 0.9} r="0.7" fill="#fff" opacity="0.85" />
				</>
			);
			brows = (
				<>
					<rect x={lx - 3.4} y={ey - 5.5} width="6.8" height="1.5" rx="0.7" fill={HAIR} />
					<rect x={rx - 3.4} y={ey - 5.5} width="6.8" height="1.5" rx="0.7" fill={HAIR} />
				</>
			);
			mouth = <path d="M43 60.5 Q50 65 57 60.5" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />;
	}

	return (
		<>
			{brows}
			{eyes}
			{lashes}
			{nose}
			{mouth}
		</>
	);
}

// ── Vello facial ─────────────────────────────────────────────────────────────
function renderFacialHair(cfg: AvatarConfig) {
	switch (cfg.facialHair) {
		case "mustache":
			return <path d="M43 58 Q46 55 50 57 Q54 55 57 58 Q54 59.5 50 58.4 Q46 59.5 43 58 Z" fill={HAIR} />;
		case "soulpatch":
			return <rect x="48" y="64.5" width="4" height="3.2" rx="1.4" fill={HAIR} />;
		case "goatee":
			return (
				<>
					<path d="M43 58 Q46 55.5 50 57 Q54 55.5 57 58 Q54 59.4 50 58.4 Q46 59.4 43 58 Z" fill={HAIR} />
					<path d="M44 62 Q50 64 56 62 Q56 69 50 71 Q44 69 44 62 Z" fill={HAIR} />
				</>
			);
		case "beard":
			return (
				<>
					<path
						d="M27 47 Q28 64 38 71 Q50 77 62 71 Q72 64 73 47 Q70 58 62 61 Q50 64 38 61 Q30 58 27 47 Z"
						fill={HAIR}
					/>
					<path d="M43 57.5 Q46 55 50 56.6 Q54 55 57 57.5 Q54 59 50 58 Q46 59 43 57.5 Z" fill={HAIR_HI} />
				</>
			);
		default:
			return null;
	}
}

// ── Collares ─────────────────────────────────────────────────────────────────
function renderNecklace(cfg: AvatarConfig) {
	if (cfg.necklace === "none") return null;
	const chain = (
		<path d="M37 76 Q50 92 63 76" stroke={GOLD} strokeWidth="2.6" fill="none" strokeLinecap="round" />
	);
	const chainShadow = (
		<path d="M37 76 Q50 92 63 76" stroke={GOLD_DK} strokeWidth="3.6" fill="none" strokeLinecap="round" opacity="0.5" />
	);
	let pendant: ReactNode = null;
	switch (cfg.necklace) {
		case "dollar":
			pendant = (
				<>
					<circle cx="50" cy="89" r="5.4" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.8" />
					<text x="50" y="91.6" textAnchor="middle" fontSize="7" fontWeight="900" fill={GOLD_DK} fontFamily="monospace">$</text>
				</>
			);
			break;
		case "cross":
			pendant = (
				<>
					<rect x="48.6" y="85" width="2.8" height="9" rx="1" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.5" />
					<rect x="46" y="87.4" width="8" height="2.8" rx="1" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.5" />
				</>
			);
			break;
		case "pendant":
			pendant = (
				<>
					<circle cx="50" cy="89.5" r="5" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.8" />
					<circle cx="50" cy="89.5" r="2.2" fill={GOLD_DK} opacity="0.55" />
				</>
			);
			break;
		default: // gold
			pendant = null;
	}
	return (
		<>
			{chainShadow}
			{chain}
			{pendant}
		</>
	);
}

// ── Lentes ───────────────────────────────────────────────────────────────────
function renderGlasses(cfg: AvatarConfig) {
	if (cfg.glasses === "none") return null;
	const bridge = <path d="M46.5 44 Q50 42.6 53.5 44" stroke="#15151a" strokeWidth="1.4" fill="none" />;
	const armL = <path d="M34 43.5 L29 46" stroke="#15151a" strokeWidth="1.6" strokeLinecap="round" />;
	const armR = <path d="M66 43.5 L71 46" stroke="#15151a" strokeWidth="1.6" strokeLinecap="round" />;

	switch (cfg.glasses) {
		case "round":
			return (
				<>
					{armL}{armR}
					<circle cx="41.5" cy="44.5" r="6" fill="#2a2f38" opacity="0.78" stroke="#15151a" strokeWidth="1.6" />
					<circle cx="58.5" cy="44.5" r="6" fill="#2a2f38" opacity="0.78" stroke="#15151a" strokeWidth="1.6" />
					{bridge}
				</>
			);
		case "shutter":
			return (
				<>
					{armL}{armR}
					<rect x="34.5" y="40.5" width="14" height="8" rx="1.2" fill="#e8192c" />
					<rect x="51.5" y="40.5" width="14" height="8" rx="1.2" fill="#e8192c" />
					{[0, 1, 2, 3].map((i) => (
						<rect key={`l${i}`} x="34.5" y={41.2 + i * 1.9} width="14" height="0.9" fill="#0c0c10" />
					))}
					{[0, 1, 2, 3].map((i) => (
						<rect key={`r${i}`} x="51.5" y={41.2 + i * 1.9} width="14" height="0.9" fill="#0c0c10" />
					))}
				</>
			);
		case "visor":
			return (
				<>
					{armL}{armR}
					<path d="M33 41 Q50 38 67 41 L66 48 Q50 51 34 48 Z" fill="#101218" opacity="0.9" stroke="#15151a" strokeWidth="1.2" />
					<path d="M36 42.5 Q50 40.5 64 42.5" stroke="#5fd0ff" strokeWidth="1" fill="none" opacity="0.6" />
				</>
			);
		default: // shades
			return (
				<>
					{armL}{armR}
					<path d="M34 41.5 Q35 48.5 41.5 48.8 Q48 49 48.5 43 L48.5 41.5 Z" fill="#15151a" />
					<path d="M65.5 41.5 Q64.6 48.5 58.4 48.8 Q52 49 51.5 43 L51.5 41.5 Z" fill="#15151a" />
					<rect x="33.5" y="40.5" width="33" height="2" rx="1" fill="#15151a" />
					<path d="M36 43 Q38 46.5 42 46.5" stroke="#5a5a66" strokeWidth="0.8" fill="none" opacity="0.7" />
				</>
			);
	}
}

// ── Pelo / gorros ────────────────────────────────────────────────────────────
function renderHat(cfg: AvatarConfig) {
	switch (cfg.hat) {
		case "none": // pelo afro corto
			return (
				<>
					<path d="M27 44 Q24 20 50 18 Q76 20 73 44 Q70 28 50 27 Q30 28 27 44 Z" fill={HAIR} />
					<path d="M27 44 Q26 33 31 28 Q29 38 31 44 Z" fill={HAIR_HI} />
				</>
			);
		case "fade":
			return (
				<>
					<path d="M29 40 Q27 22 50 20 Q73 22 71 40 Q68 27 50 26 Q32 27 29 40 Z" fill={HAIR} />
					<path d="M32 41 Q31 35 34 31" stroke={HAIR_HI} strokeWidth="1" fill="none" opacity="0.6" />
				</>
			);
		case "snapback":
			return (
				<>
					{/* visera */}
					<path d="M24 36 Q36 33 50 34 L50 39 Q34 39 23 41 Q22 37 24 36 Z" fill="#15151a" />
					{/* copa */}
					<path d="M28 36 Q28 17 50 16 Q72 17 72 36 Q72 38 70 38 L30 38 Q28 38 28 36 Z" fill="#e8192c" />
					<path d="M50 16 L50 38" stroke="#b00f1d" strokeWidth="0.8" opacity="0.5" />
					<rect x="46" y="22" width="8" height="6" rx="1" fill="#fff" opacity="0.9" />
				</>
			);
		case "beanie":
			return (
				<>
					<path d="M27 40 Q26 19 50 18 Q74 19 73 40 Q74 41 72 41 L28 41 Q26 41 27 40 Z" fill="#2f7d4f" />
					{[30, 38, 46, 54, 62, 70].map((x) => (
						<path key={x} d={`M${x} 20 L${x} 40`} stroke="#256340" strokeWidth="1" opacity="0.6" />
					))}
					<rect x="26" y="38" width="48" height="6" rx="3" fill="#256340" />
				</>
			);
		case "bucket":
			return (
				<>
					<path d="M22 40 Q50 35 78 40 Q78 45 72 46 L28 46 Q22 45 22 40 Z" fill="#3a6ea5" />
					<path d="M30 40 Q30 22 50 21 Q70 22 70 40 Z" fill="#4a82bf" />
					<path d="M30 35 Q50 32 70 35" stroke="#2c5680" strokeWidth="1.4" fill="none" />
				</>
			);
		case "durag":
			return (
				<>
					<path d="M27 42 Q25 21 50 20 Q75 21 73 42 Q70 30 50 29 Q30 30 27 42 Z" fill="#15151a" />
					{/* nudo + colas */}
					<path d="M70 30 Q82 30 84 40 Q80 38 72 36 Z" fill="#1c1c22" />
					<path d="M71 33 Q86 36 88 50 Q80 44 70 39 Z" fill="#15151a" opacity="0.85" />
				</>
			);
		case "hood":
			return (
				<>
					<path d="M18 60 Q14 24 50 22 Q86 24 82 60 Q80 44 72 42 Q72 22 50 21 Q28 22 28 42 Q20 44 18 60 Z" fill="#2b2b33" />
					<path d="M28 42 Q26 30 33 25" stroke="#1c1c22" strokeWidth="1.2" fill="none" opacity="0.7" />
				</>
			);
		case "crown":
			return (
				<>
					<path d="M30 30 L32 16 L40 25 L50 13 L60 25 L68 16 L70 30 Z" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.8" strokeLinejoin="round" />
					<rect x="30" y="29" width="40" height="4.5" rx="1" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.6" />
					<circle cx="32" cy="16" r="2" fill="#e8192c" />
					<circle cx="50" cy="13" r="2.2" fill="#2563eb" />
					<circle cx="68" cy="16" r="2" fill="#e8192c" />
					<circle cx="40" cy="31.2" r="1.3" fill="#fff" opacity="0.8" />
					<circle cx="60" cy="31.2" r="1.3" fill="#fff" opacity="0.8" />
				</>
			);
		default:
			return null;
	}
}

// ── Accesorios ───────────────────────────────────────────────────────────────
function renderAccessoryEar(cfg: AvatarConfig) {
	if (cfg.accessory === "earring") {
		return <circle cx="27.5" cy="55" r="1.8" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.5" />;
	}
	return null;
}

function renderAccessoryTop(cfg: AvatarConfig) {
	switch (cfg.accessory) {
		case "grillz":
			return <rect x="44.5" y="62.5" width="11" height="3" rx="0.6" fill={GOLD} stroke={GOLD_DK} strokeWidth="0.4" opacity="0.95" />;
		case "bandana":
			return (
				<>
					<path d="M27 36 Q50 31 73 36 L72 41 Q50 37 28 41 Z" fill="#e8192c" />
					<path d="M30 37.5 Q50 34 70 37.5" stroke="#fff" strokeWidth="0.7" fill="none" opacity="0.5" strokeDasharray="2 2" />
				</>
			);
		case "headphones":
			return (
				<>
					<path d="M22 46 Q22 16 50 15 Q78 16 78 46" stroke="#15151a" strokeWidth="3.2" fill="none" strokeLinecap="round" />
					<rect x="19.5" y="43" width="8" height="12" rx="3" fill="#e8192c" stroke="#15151a" strokeWidth="0.8" />
					<rect x="72.5" y="43" width="8" height="12" rx="3" fill="#e8192c" stroke="#15151a" strokeWidth="0.8" />
				</>
			);
		default:
			return null;
	}
}
