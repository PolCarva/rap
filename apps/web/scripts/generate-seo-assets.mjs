/**
 * Genera todos los assets visuales de SEO/branding de Rap Arena:
 * favicon (svg/ico/png), iconos PWA/Apple/maskable, safari mask y las
 * imágenes Open Graph / Twitter (general + por sección).
 *
 * El texto se rasteriza a paths vectoriales con la tipografía real de la
 * marca (Anton display · Oswald), por lo que los SVG servidos al navegador
 * se ven idénticos al sitio sin depender de fuentes instaladas.
 *
 * Uso:  node scripts/generate-seo-assets.mjs
 * Deps: opentype.js · sharp · png-to-ico (devDependencies)
 * Fuentes vendorizadas en ./seo-fonts (OFL, Google Fonts).
 */
import opentype from "opentype.js";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dirname, "..", "public");
const anton = opentype.loadSync(join(__dirname, "seo-fonts", "Anton-Regular.ttf"));
const oswald = opentype.loadSync(join(__dirname, "seo-fonts", "Oswald.ttf"));

/* ---- Brand tokens (design system) ---- */
const C = {
	ink: "#08080b",
	ink2: "#0e0e13",
	ink3: "#15151b",
	bone: "#f2ecdd",
	boneDim: "#a8a294",
	red: "#e8192c",
	redHot: "#ff2d40",
	redDeep: "#7e0d19",
	line: "#26262e",
};

/* ---- Text → vector path layout ---- */
function layout(font, text, size, tracking = 0) {
	const scale = size / font.unitsPerEm;
	const path = new opentype.Path();
	let x = 0;
	for (const ch of [...text]) {
		const glyph = font.charToGlyph(ch);
		path.extend(glyph.getPath(x, 0, size));
		x += glyph.advanceWidth * scale + tracking;
	}
	return { d: path.toPathData(2), width: x - (text.length ? tracking : 0) };
}

// Returns an SVG <g> with text rendered as a path. anchor: start|middle|end
function T(font, text, opts = {}) {
	const {
		size = 40,
		x = 0,
		y = 0,
		fill = C.bone,
		anchor = "start",
		skew = 0,
		tracking = 0,
		stroke = null,
		strokeW = 0,
		opacity = 1,
	} = opts;
	const { d, width } = layout(font, text, size, tracking);
	let tx = x;
	if (anchor === "middle") tx = x - width / 2;
	else if (anchor === "end") tx = x - width;
	const paint = stroke
		? `fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round"`
		: `fill="${fill}"`;
	return {
		svg: `<g transform="translate(${r(tx)} ${r(y)})${skew ? ` skewX(${skew})` : ""}" opacity="${opacity}"><path d="${d}" ${paint}/></g>`,
		width,
	};
}
const r = (n) => Math.round(n * 100) / 100;

/* ============================================================
   ICON — bold "RA" monogram, red blade, spotlight
   ============================================================ */
function iconSVG({ size = 512, rounded = true, pad = 1, bg = true } = {}) {
	const s = size;
	const k = pad; // content scale (1 = full, <1 = padded for maskable)
	const cx = s / 2;
	const rx = rounded ? s * 0.215 : 0;
	const defs = `
	<defs>
		<radialGradient id="glow" cx="0.5" cy="0.16" r="0.85">
			<stop offset="0" stop-color="${C.red}" stop-opacity="0.55"/>
			<stop offset="0.45" stop-color="${C.red}" stop-opacity="0.12"/>
			<stop offset="1" stop-color="${C.red}" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${C.ink3}"/>
			<stop offset="0.5" stop-color="${C.ink}"/>
			<stop offset="1" stop-color="${C.ink}"/>
		</linearGradient>
	</defs>`;
	const bgRect = bg
		? `<rect width="${s}" height="${s}" rx="${rx}" fill="url(#bgg)"/>
		   <rect width="${s}" height="${s}" rx="${rx}" fill="url(#glow)"/>`
		: "";

	// monogram geometry, centered & scaled by k
	const mono = (() => {
		const fs = s * 0.5 * k;
		const baseY = cx + fs * 0.34; // visual vertical centering
		// red blade behind the lower third
		const bladeY = baseY + fs * 0.07;
		const bw = s * 0.5 * k;
		const bh = s * 0.085 * k;
		const blade = `<g transform="translate(${cx} ${bladeY}) skewX(-12)"><rect x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" fill="${C.red}"/></g>`;
		const ra = T(anton, "RA", {
			size: fs,
			x: cx,
			y: baseY,
			anchor: "middle",
			fill: C.bone,
			skew: -7,
			tracking: -fs * 0.04,
		}).svg;
		// red corner tick (brand "." accent)
		const tick = s * 0.05 * k;
		const dot = `<rect x="${cx + s * 0.205 * k}" y="${baseY - tick}" width="${tick}" height="${tick}" fill="${C.red}"/>`;
		return blade + ra + dot;
	})();

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="Rap Arena">${defs}${bgRect}${mono}</svg>`;
}

// Monochrome silhouette for safari-pinned-tab (single color, transparent bg)
function maskIconSVG() {
	const s = 512;
	const cx = s / 2;
	const fs = s * 0.5;
	const baseY = cx + fs * 0.34;
	const ra = T(anton, "RA", { size: fs, x: cx, y: baseY, anchor: "middle", fill: "#000000", skew: -7, tracking: -fs * 0.04 }).svg;
	const bw = s * 0.5;
	const bh = s * 0.085;
	const blade = `<g transform="translate(${cx} ${baseY + fs * 0.07}) skewX(-12)"><rect x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" fill="#000000"/></g>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${blade}${ra}</svg>`;
}

/* ============================================================
   OG frame + variants (1200x630)
   ============================================================ */
const W = 1200;
const H = 630;

function ogDefs() {
	return `
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="0.65" y2="1">
			<stop offset="0" stop-color="#0b0b10"/>
			<stop offset="0.5" stop-color="#121319"/>
			<stop offset="1" stop-color="${C.ink}"/>
		</linearGradient>
		<radialGradient id="topglow" cx="0.5" cy="0" r="0.8">
			<stop offset="0" stop-color="${C.red}" stop-opacity="0.28"/>
			<stop offset="1" stop-color="${C.red}" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="spotL" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${C.red}" stop-opacity="0.30"/>
			<stop offset="0.75" stop-color="${C.red}" stop-opacity="0"/>
		</linearGradient>
		<linearGradient id="spotR" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${C.bone}" stop-opacity="0.14"/>
			<stop offset="0.75" stop-color="${C.bone}" stop-opacity="0"/>
		</linearGradient>
		<pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
			<path d="M44 0H0v44" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
		</pattern>
	</defs>`;
}

function crowd(y = H) {
	// silhouette heads arc along the bottom
	let heads = "";
	const n = 26;
	for (let i = 0; i < n; i++) {
		const t = i / (n - 1);
		const x = 30 + t * (W - 60);
		const rr = 26 + Math.sin(i * 1.7) * 6 + (Math.abs(t - 0.5) < 0.25 ? 10 : 0);
		const yy = y + 30 - Math.sin(t * Math.PI) * 14;
		heads += `<circle cx="${r(x)}" cy="${r(yy)}" r="${r(rr)}" fill="#040406"/>`;
	}
	return `<g opacity="0.95">${heads}</g>`;
}

function ogFrame() {
	return `
	<rect width="${W}" height="${H}" fill="url(#bg)"/>
	<rect width="${W}" height="${H}" fill="url(#grid)"/>
	<rect width="${W}" height="${H}" fill="url(#topglow)"/>
	<g transform="translate(250 -40) rotate(8)"><rect x="-110" y="0" width="220" height="${H + 120}" fill="url(#spotL)" opacity="0.9"/></g>
	<g transform="translate(960 -40) rotate(-8)"><rect x="-130" y="0" width="260" height="${H + 120}" fill="url(#spotR)" opacity="0.9"/></g>
	${crowd(H - 4)}
	<rect x="0" y="0" width="${W}" height="6" fill="${C.red}"/>
	<rect x="0" y="${H - 6}" width="${W}" height="6" fill="${C.ink3}"/>
	<rect x="0" y="${H - 6}" width="${W * 0.34}" height="6" fill="${C.red}"/>`;
}

function ogFooter(right = "rap.raparena.workers.dev") {
	return `
	<circle cx="74" cy="${H - 52}" r="6" fill="${C.red}"/>
	${T(oswald, "FREESTYLE ONLINE · SIN DESCARGAS", { size: 22, x: 92, y: H - 44, fill: C.boneDim, tracking: 3 }).svg}
	${T(oswald, right.toUpperCase(), { size: 22, x: W - 64, y: H - 44, anchor: "end", fill: C.boneDim, tracking: 3 }).svg}`;
}

// VS emblem (skewed red badge, like in-app .vs-badge)
function vsBadge(x, y, scale = 1) {
	const w = 150 * scale;
	const h = 120 * scale;
	const vs = T(anton, "VS", { size: 86 * scale, x: 0, y: 0, anchor: "middle", fill: C.ink, skew: 0 });
	return `<g transform="translate(${x} ${y}) skewX(-8)">
		<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${C.red}"/>
		<g transform="translate(0 ${h * 0.24})">${vs.svg}</g>
	</g>`;
}

// CTA button (skewed red block + upright Anton label + arrow), like .btn-arena.
// Positioned by left edge x and vertical center cy.
function ctaButton(text, x, cy, scale = 1) {
	const fs = 31 * scale;
	const label = text.toUpperCase();
	const { width: tw } = layout(anton, label, fs, 1);
	const aw = fs * 0.6;
	const gap = fs * 0.55;
	const padX = fs * 1.0;
	const h = fs * 1.95;
	const w = tw + gap + aw + padX * 2;
	const ax = padX + tw + gap;
	const ah = fs * 0.7;
	const arrow = `<path d="M${r(ax)} ${r(-ah / 2)} L${r(ax + aw)} 0 L${r(ax)} ${r(ah / 2)} Z" fill="${C.ink}"/>`;
	const labelEl = T(anton, label, { size: fs, x: padX, y: fs * 0.34, fill: C.ink, tracking: 1 }).svg;
	return `<g transform="translate(${x} ${cy}) skewX(-6)">
		<rect x="9" y="${r(-h / 2 + 9)}" width="${r(w)}" height="${r(h)}" fill="${C.redDeep}" opacity="0.5"/>
		<rect x="0" y="${r(-h / 2)}" width="${r(w)}" height="${r(h)}" fill="${C.red}"/>
		<g transform="skewX(6)">${labelEl}${arrow}</g>
	</g>`;
}

function buildOG({ kicker, lineTop, lineTopMode = "stroke", lineBot, sub, cta = "Batallá gratis", extra = "", rightEmblem = true }) {
	const kickerEl = T(oswald, kicker.toUpperCase(), { size: 28, x: 66, y: 104, fill: C.red, tracking: 8 }).svg;
	const topSize = 140;
	const top =
		lineTopMode === "stroke"
			? T(anton, lineTop, { size: topSize, x: 60, y: 242, fill: "none", stroke: C.bone, strokeW: 3, skew: -3 }).svg
			: T(anton, lineTop, { size: topSize, x: 60, y: 242, fill: C.bone, skew: -3 }).svg;
	const bot = T(anton, lineBot, { size: topSize, x: 60, y: 242 + topSize * 0.94, fill: C.red, skew: -3 }).svg;
	const subEl = T(oswald, sub.toUpperCase(), { size: 27, x: 66, y: 436, fill: C.bone, tracking: 3 }).svg;
	const ctaEl = ctaButton(cta, 64, 505);
	const emblem = rightEmblem ? vsBadge(1012, 286, 1.12) : "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rap Arena">
${ogDefs()}${ogFrame()}
${emblem}
${kickerEl}
${top}
${bot}
${subEl}
${ctaEl}
${extra}
${ogFooter()}
</svg>`;
}

/* ---- Page-specific extras ---- */
function rankingExtra() {
	const rows = [
		["01", "CAMPEÓN", "1640"],
		["02", "RETADOR", "1582"],
		["03", "AMENAZA", "1514"],
	];
	let g = "";
	let y = 250;
	for (const [pos, name, elo] of rows) {
		g += T(anton, pos, { size: 40, x: 760, y, fill: C.red }).svg;
		g += T(oswald, name, { size: 34, x: 830, y, fill: C.bone, tracking: 2 }).svg;
		g += T(oswald, `${elo} ELO`, { size: 34, x: 1136, y, anchor: "end", fill: C.boneDim, tracking: 1 }).svg;
		g += `<rect x="760" y="${y + 16}" width="376" height="1" fill="${C.line}"/>`;
		y += 76;
	}
	return `<g>${g}</g>`;
}

function profileExtra() {
	// avatar medallion on the right
	const cx = 1020;
	const cy = 280;
	return `<g>
		<circle cx="${cx}" cy="${cy}" r="120" fill="${C.ink2}" stroke="${C.red}" stroke-width="6"/>
		<circle cx="${cx}" cy="${cy - 34}" r="44" fill="${C.bone}"/>
		<path d="M${cx - 78} ${cy + 100}c20-66 136-66 156 0z" fill="${C.bone}"/>
	</g>`;
}

/* ============================================================
   WRITE + RENDER
   ============================================================ */
async function svgToPng(svg, file, w, h) {
	await sharp(Buffer.from(svg), { density: 384 })
		.resize(w, h, { fit: "fill" })
		.png({ compressionLevel: 9 })
		.toFile(join(PUB, file));
	console.log("png  ", file, `${w}x${h}`);
}
function writeSVG(svg, file) {
	writeFileSync(join(PUB, file), svg.trim() + "\n");
	console.log("svg  ", file);
}

const master = iconSVG({ size: 512, rounded: true });
const masterSquare = iconSVG({ size: 512, rounded: false }); // apple / tile (OS rounds)
const maskable = iconSVG({ size: 512, rounded: false, pad: 0.66 });

// SVGs served to the browser
writeSVG(iconSVG({ size: 512, rounded: true }), "favicon.svg");
writeSVG(iconSVG({ size: 512, rounded: true }), "icon.svg");
writeSVG(maskIconSVG(), "safari-pinned-tab.svg");

const og = buildOG({
	kicker: "Underground Freestyle League",
	lineTop: "RAP",
	lineTopMode: "stroke",
	lineBot: "ARENA",
	sub: "Batallas 1 vs 1 · Beats · Juez IA · Ranking ELO",
	cta: "Batallá gratis",
});
writeSVG(og, "og-image.svg");

const ogArena = buildOG({
	kicker: "Arena en vivo",
	lineTop: "ENTRÁ A",
	lineTopMode: "solid",
	lineBot: "LA ARENA",
	sub: "Matchmaking 1 vs 1 · Elegí modo, beat y rival",
	cta: "Buscar rival",
});
writeSVG(ogArena, "og-arena.svg");

const ogRanking = buildOG({
	kicker: "La tabla no miente",
	lineTop: "RANKING",
	lineTopMode: "solid",
	lineBot: "ELO",
	sub: "Top MCs · Racha · Win rate",
	cta: "Ver ranking",
	extra: rankingExtra(),
	rightEmblem: false,
});
writeSVG(ogRanking, "og-ranking.svg");

const ogBatallas = buildOG({
	kicker: "Últimos veredictos",
	lineTop: "BATALLAS",
	lineTopMode: "solid",
	lineBot: "EN VIVO",
	sub: "Resultados · Modos · Scores · Rimas",
	cta: "Ver batallas",
});
writeSVG(ogBatallas, "og-batallas.svg");

const ogProfile = buildOG({
	kicker: "Perfil de MC",
	lineTop: "MC",
	lineTopMode: "solid",
	lineBot: "STATS",
	sub: "ELO · Batallas · Racha · Win rate",
	cta: "Ver mi perfil",
	extra: profileExtra(),
	rightEmblem: false,
});
writeSVG(ogProfile, "og-profile.svg");

// PNG renders
await svgToPng(master, "favicon-16x16.png", 16, 16);
await svgToPng(master, "favicon-32x32.png", 32, 32);
await svgToPng(master, "favicon-64x64.png", 64, 64);
await svgToPng(master, "icon-192.png", 192, 192);
await svgToPng(master, "icon-512.png", 512, 512);
await svgToPng(maskable, "maskable-icon.png", 512, 512);
await svgToPng(masterSquare, "apple-touch-icon.png", 180, 180);
await svgToPng(masterSquare, "mstile-150x150.png", 150, 150);

await svgToPng(og, "og-image.png", W, H);
await svgToPng(og, "twitter-image.png", W, H);
await svgToPng(ogArena, "og-arena.png", W, H);
await svgToPng(ogRanking, "og-ranking.png", W, H);
await svgToPng(ogBatallas, "og-batallas.png", W, H);
await svgToPng(ogProfile, "og-profile.png", W, H);

// favicon.ico (multi-size)
const icoSizes = [16, 32, 48, 64];
const icoBufs = await Promise.all(
	icoSizes.map((sz) => sharp(Buffer.from(master), { density: 384 }).resize(sz, sz, { fit: "fill" }).png().toBuffer()),
);
writeFileSync(join(PUB, "favicon.ico"), await pngToIco(icoBufs));
console.log("ico   favicon.ico", icoSizes.join(","));

console.log("\n✓ SEO assets generated");
