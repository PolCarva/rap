"use client";

import { CrowdEffect } from "@/components/CrowdEffect";
import { AppNav } from "@/components/AppNav";
import { SmokeCanvas } from "@/components/SmokeCanvas";
import { useAudioEngine } from "@/components/useAudioEngine";
import { usePlayerCounts } from "@/components/usePlayerCounts";
import Link from "next/link";

const MARQUEE_ITEMS = ["EASY MODE", "4X4", "MINUTO LIBRE", "HARD MODE", "TEMÁTICAS", "FREESTYLE", "PUNCHLINES", "FLOW", "BARRAS"];

export default function Home() {
	const audio = useAudioEngine();
	const counts = usePlayerCounts();
	return (
		<main style={{ position: "relative", height: "100vh", overflow: "hidden", background: "var(--ink)" }}>
			{/* Smoke canvas — z-index 1 */}
			<SmokeCanvas count={16} redChance={0.3} />

			{/* Spotlight cones — z-index 2 */}
			<div className="arena-spot left" />
			<div className="arena-spot right" />

			{/* Grain + vignette — z-index 80–90 */}
			<div className="arena-grain" />
			<div className="arena-vignette" />

			{/* Crowd silhouettes — z-index 50 */}
			<CrowdEffect count={40} />

			<AppNav status={`${counts.total > 0 ? counts.total : "-"} MCS EN LINEA - UNDERGROUND FREESTYLE LEAGUE`} />

			{/* Hero stage — z-index 10 */}
			<div
				style={{
					position: "relative",
					height: "100vh",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					padding: "64px 20px 110px",
					zIndex: 10,
				}}
			>
				<div className="arena-hero">
					{/* Each element gets its own entrance animation class */}
					<div className="arena-hero-over">EL CYPHER ESTÁ ABIERTO — NO MERCY</div>
					<h1>
						<span className="row rap arena-hero-rap">RAP</span>
						<span className="row arena arena-hero-arena">ARENA</span>
					</h1>
					<div className="arena-hero-under">
						<span className="bar" />
						<span>BATALLAS 1 VS 1 · EN VIVO · SIN FILTRO</span>
						<span className="bar" />
					</div>
				</div>

				{/* CTA — staggered entrance */}
				<div className="arena-cta-zone" style={{ position: "relative", zIndex: 56, marginTop: "5.5vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
					<Link href="/arena" className="btn-arena" style={{ fontSize: "clamp(20px, 2.3vw, 28px)", letterSpacing: "0.06em", padding: "18px 48px" }}>
						<span>EMPEZAR A RAPEAR →</span>
					</Link>
					<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--bone-dim)" }}>
						NECESITAS MIC + CÁMARA · ENTRA BAJO TU PROPIO RIESGO
					</div>
				</div>
			</div>

			{/* Sound toggle — z-index 70 */}
			<button
				onClick={audio.toggle}
				className="btn-ghost"
				style={{
					position: "fixed",
					right: 28,
					bottom: 64,
					zIndex: 70,
					fontSize: 11,
					letterSpacing: "0.2em",
				}}
			>
				SONIDO: {audio.on ? "ON" : "OFF"}
			</button>

			{/* Bottom strip — z-index 55 */}
			<div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 55 }}>
				<div className="arena-marquee">
					<div className="track">
						{[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].flatMap((item, i) => [
							<span key={`t${i}`}>{item}</span>,
							<span key={`x${i}`} className="x">✕</span>,
						])}
					</div>
				</div>
				<div className="arena-stripe" />
			</div>
		</main>
	);
}
