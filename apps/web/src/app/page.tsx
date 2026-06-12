"use client";

import { CrowdEffect } from "@/components/CrowdEffect";
import { AppNav } from "@/components/AppNav";
import { SmokeCanvas } from "@/components/SmokeCanvas";
import { useAudioEngine } from "@/components/useAudioEngine";
import { usePlayerCounts } from "@/components/usePlayerCounts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MARQUEE_ITEMS = ["EASY MODE", "4X4", "MINUTO LIBRE", "HARD MODE", "TEMÁTICAS", "FREESTYLE", "PUNCHLINES", "FLOW", "BARRAS"];

interface TickerBattle {
	id: string;
	player1Name: string;
	player2Name: string;
	winner: "p1" | "p2" | "draw" | null;
	scoreP1: number | null;
	scoreP2: number | null;
	modality: string;
	status: string;
}

/** Título partido en letras para la micro-interacción de hover. */
function KineticRow({ text, className }: { text: string; className: string }) {
	return (
		<span className={`row ${className}`} aria-label={text}>
			{[...text].map((ch, i) => (
				<span key={i} className="kin" style={{ animationDelay: `${i * 60}ms` }} aria-hidden="true">
					{ch}
				</span>
			))}
		</span>
	);
}

export default function Home() {
	const audio = useAudioEngine();
	const counts = usePlayerCounts();
	const mainRef = useRef<HTMLElement>(null);
	const ctaRef = useRef<HTMLAnchorElement>(null);
	const [ticker, setTicker] = useState<TickerBattle[]>([]);

	// Batallas recientes reales para el ticker inferior.
	useEffect(() => {
		let active = true;
		fetch("/api/battles")
			.then((r) => r.json() as Promise<{ battles: TickerBattle[] }>)
			.then(({ battles }) => {
				if (!active) return;
				setTicker(battles.filter((battle) => battle.status === "finished" && battle.winner && battle.winner !== "draw").slice(0, 8));
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	// Parallax sutil: el escenario respira con el mouse (CSS vars --mx/--my).
	useEffect(() => {
		const el = mainRef.current;
		if (!el) return;
		const onMove = (e: MouseEvent) => {
			const x = e.clientX / window.innerWidth - 0.5;
			const y = e.clientY / window.innerHeight - 0.5;
			el.style.setProperty("--mx", x.toFixed(3));
			el.style.setProperty("--my", y.toFixed(3));
		};
		window.addEventListener("mousemove", onMove, { passive: true });
		return () => window.removeEventListener("mousemove", onMove);
	}, []);

	// CTA magnético: se inclina hacia el cursor cuando está cerca.
	useEffect(() => {
		const btn = ctaRef.current;
		if (!btn) return;
		const onMove = (e: MouseEvent) => {
			const rect = btn.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const dx = e.clientX - cx;
			const dy = e.clientY - cy;
			const dist = Math.hypot(dx, dy);
			const radius = 180;
			if (dist < radius) {
				const pull = (1 - dist / radius) * 10;
				btn.style.transform = `translate(${(dx / dist) * pull || 0}px, ${(dy / dist) * pull || 0}px)`;
			} else {
				btn.style.transform = "";
			}
		};
		window.addEventListener("mousemove", onMove, { passive: true });
		return () => window.removeEventListener("mousemove", onMove);
	}, []);

	return (
		<main ref={mainRef} className="landing-stage" style={{ position: "relative", height: "100vh", overflow: "hidden", background: "var(--ink)" }}>
			{/* Smoke canvas — z-index 1 */}
			<div className="px-smoke">
				<SmokeCanvas count={16} redChance={0.3} />
			</div>

			{/* Spotlight cones — z-index 2 */}
			<div className="px-spots">
				<div className="arena-spot left" />
				<div className="arena-spot right" />
			</div>

			{/* Grain + vignette — z-index 80–90 */}
			<div className="arena-grain" />
			<div className="arena-vignette" />

			{/* Crowd silhouettes — z-index 50 */}
			<div className="px-crowd">
				<CrowdEffect count={40} />
			</div>

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
				<div className="arena-hero px-hero">
					<div className="arena-hero-over">EL CYPHER ESTÁ ABIERTO — NO MERCY</div>
					<h1>
						<KineticRow text="RAP" className="rap arena-hero-rap" />
						<KineticRow text="ARENA" className="arena arena-hero-arena" />
					</h1>
					<div className="arena-hero-under">
						<span className="bar" />
						<span>BATALLAS 1 VS 1 · EN VIVO · SIN FILTRO</span>
						<span className="bar" />
					</div>
				</div>

				{/* CTA — staggered entrance */}
				<div className="arena-cta-zone" style={{ position: "relative", zIndex: 56, marginTop: "5.5vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
					<Link
						ref={ctaRef}
						href="/arena"
						className="btn-arena cta-magnetic"
						style={{ fontSize: "clamp(20px, 2.3vw, 28px)", letterSpacing: "0.06em", padding: "18px 48px" }}
					>
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
					bottom: ticker.length > 0 ? 96 : 64,
					zIndex: 70,
					fontSize: 11,
					letterSpacing: "0.2em",
				}}
			>
				SONIDO: {audio.on ? "ON" : "OFF"}
			</button>

			{/* Bottom strip — z-index 55 */}
			<div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 55 }}>
				{ticker.length > 0 && (
					<div className="live-ticker" aria-label="Resultados recientes">
						<span className="live-ticker-label">
							<span className="arena-live-dot" style={{ margin: 0 }} />
							ÚLTIMOS VEREDICTOS
						</span>
						<div className="live-ticker-track">
							{[...ticker, ...ticker].map((battle, i) => {
								const winner = battle.winner === "p1" ? battle.player1Name : battle.player2Name;
								const loser = battle.winner === "p1" ? battle.player2Name : battle.player1Name;
								const score =
									battle.scoreP1 !== null && battle.scoreP2 !== null
										? battle.winner === "p1"
											? `${battle.scoreP1}-${battle.scoreP2}`
											: `${battle.scoreP2}-${battle.scoreP1}`
										: "";
								return (
									<span key={`${battle.id}:${i}`} className="live-ticker-item">
										<b>{winner.toUpperCase()}</b> VENCIÓ A {loser.toUpperCase()} {score && <em>{score}</em>}
										<span className="x">✕</span>
									</span>
								);
							})}
						</div>
					</div>
				)}
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
