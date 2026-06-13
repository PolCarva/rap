"use client";

import { AppNav } from "@/components/AppNav";
import { Reveal } from "@/components/fx/Reveal";
import { TransitionLink } from "@/components/fx/PageTransition";
import { usePlayerCounts } from "@/components/usePlayerCounts";
import { MODALITIES, MODALITY_IDS, type RankingEntry } from "@rap/shared";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const HeroScene = dynamic(() => import("@/components/three/HeroScene").then((m) => m.HeroScene), {
	ssr: false,
});

interface TickerBattle {
	id: string;
	player1Name: string;
	player2Name: string;
	winner: "p1" | "p2" | "draw" | null;
	scoreP1: number | null;
	scoreP2: number | null;
	status: string;
}

const STEPS = [
	{
		num: "01",
		title: "ARMÁ TU ENTRADA",
		body: "Elegí tu AKA, el modo de batalla y el beat. Probá cámara y mic: el escenario es tuyo.",
	},
	{
		num: "02",
		title: "RAPEÁ EN VIVO",
		body: "Matchmaking en segundos. Cara a cara, por turnos, con transcripción palabra por palabra y tus rimas coloreadas en tiempo real.",
	},
	{
		num: "03",
		title: "EL JUEZ DECIDE",
		body: "Una IA entrenada como jurado profesional puntúa flow, rimas, punchlines y respuesta. ELO real, ranking real, sin amiguismos.",
	},
] as const;

const DIFF: Record<string, string> = {
	"4x4": "MEDIO",
	"minuto-libre": "ABIERTO",
	palabras: "RIMAS",
	hard: "HARD",
	easy: "EASY",
	deconceptos: "CONCEPTUAL",
};

export default function Home() {
	const counts = usePlayerCounts();
	const [ticker, setTicker] = useState<TickerBattle[]>([]);
	const [top, setTop] = useState<RankingEntry[]>([]);
	const heroRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let active = true;
		fetch("/api/battles")
			.then((r) => r.json() as Promise<{ battles: TickerBattle[] }>)
			.then(({ battles }) => {
				if (active) setTicker(battles.filter((b) => b.status === "finished" && b.winner && b.winner !== "draw").slice(0, 8));
			})
			.catch(() => {});
		fetch("/api/ranking")
			.then((r) => r.json() as Promise<{ ranking: RankingEntry[] }>)
			.then(({ ranking }) => {
				if (active) setTop(ranking.slice(0, 3));
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	// El hero se desvanece y encoge al scrollear (efecto cámara que se aleja).
	useEffect(() => {
		const el = heroRef.current;
		if (!el) return;
		let raf = 0;
		const onScroll = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const p = Math.min(1, window.scrollY / window.innerHeight);
				el.style.setProperty("--scroll-p", p.toFixed(3));
			});
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	return (
		<main className="cine">
			<AppNav status={`${counts.total > 0 ? counts.total : "-"} MCS EN LINEA - UNDERGROUND FREESTYLE LEAGUE`} />

			{/* ============ ACTO 1: HERO 3D ============ */}
			<section className="cine-hero" ref={heroRef}>
				<HeroScene />
				<div className="arena-grain" />
				<div className="cine-hero-content">
					<p className="cine-over glitch" data-text="UNDERGROUND FREESTYLE LEAGUE">
						UNDERGROUND FREESTYLE LEAGUE
					</p>
					<h1 className="cine-title" aria-label="RAPEAR ONLINE">
						<span className="line">
							{[..."RAPEAR"].map((c, i) => (
								<span key={i} className="ch" style={{ animationDelay: `${0.35 + i * 0.07}s` }}>
									{c}
								</span>
							))}
						</span>
						<span className="line filled">
							{[..."ONLINE"].map((c, i) => (
								<span key={i} className="ch" style={{ animationDelay: `${0.6 + i * 0.07}s` }}>
									{c}
								</span>
							))}
						</span>
					</h1>
					<p className="cine-sub">TU VOZ ES EL ARMA · BATALLAS 1VS1 EN VIVO · UN JUEZ IA SIN PIEDAD</p>
					<div className="cine-cta-row">
						<TransitionLink href="/arena" className="btn-arena cine-cta">
							<span>ENTRAR A LA ARENA →</span>
						</TransitionLink>
						<TransitionLink href="/ranking" className="btn-ghost cine-cta-ghost">
							VER EL RANKING
						</TransitionLink>
					</div>
				</div>
				<div className="cine-scroll-hint" aria-hidden="true">
					<span className="wheel" />
					SCROLL
				</div>
				{ticker.length > 0 && (
					<div className="live-ticker cine-ticker" aria-label="Resultados recientes">
						<span className="live-ticker-label">
							<span className="arena-live-dot" style={{ margin: 0 }} />
							ÚLTIMOS VEREDICTOS
						</span>
						<div className="live-ticker-track">
							{[...ticker, ...ticker].map((b, i) => {
								const winner = b.winner === "p1" ? b.player1Name : b.player2Name;
								const loser = b.winner === "p1" ? b.player2Name : b.player1Name;
								const score =
									b.scoreP1 !== null && b.scoreP2 !== null
										? b.winner === "p1"
											? `${b.scoreP1}-${b.scoreP2}`
											: `${b.scoreP2}-${b.scoreP1}`
										: "";
								return (
									<span key={`${b.id}:${i}`} className="live-ticker-item">
										<b>{winner.toUpperCase()}</b> VENCIÓ A {loser.toUpperCase()} {score && <em>{score}</em>}
										<span className="x">✕</span>
									</span>
								);
							})}
						</div>
					</div>
				)}
			</section>

			{/* ============ ACTO 2: LOS MODOS ============ */}
			<section className="cine-section">
				<Reveal className="cine-section-head">
					<p className="cine-kicker">ELEGÍ TU GUERRA</p>
					<h2 className="cine-h2">
						SEIS <em>MODOS</em>
					</h2>
				</Reveal>
				<div className="cine-modes">
					{MODALITY_IDS.map((id, index) => {
						const m = MODALITIES[id];
						return (
							<Reveal key={id} delay={index * 90} className="cine-mode-wrap">
								<TransitionLink href={`/arena?modo=${encodeURIComponent(id)}`} className="cine-mode">
									<span className="cine-mode-index">{String(index + 1).padStart(2, "0")}</span>
									<span className="cine-mode-name">{m.name}</span>
									<span className="cine-mode-desc">{m.description}</span>
									<span className="cine-mode-meta">
										{m.turnBars ? `${m.rounds} × ${m.turnBars} COMPASES` : `${m.rounds} × ~${m.turnDurationSec}S`} · {DIFF[id]}
									</span>
									<span className="cine-mode-arrow">→</span>
								</TransitionLink>
							</Reveal>
						);
					})}
				</div>
			</section>

			{/* ============ ACTO 3: CÓMO FUNCIONA ============ */}
			<section className="cine-section dark">
				<Reveal className="cine-section-head">
					<p className="cine-kicker">DEL SOFÁ AL ESCENARIO</p>
					<h2 className="cine-h2">
						ASÍ SE <em>BATALLA</em>
					</h2>
				</Reveal>
				<div className="cine-steps">
					{STEPS.map((step, index) => (
						<Reveal key={step.num} delay={index * 120} className="cine-step">
							<span className="cine-step-num">{step.num}</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</Reveal>
					))}
				</div>
			</section>

			{/* ============ ACTO 4: RANKING ============ */}
			{top.length > 0 && (
				<section className="cine-section">
					<Reveal className="cine-section-head">
						<p className="cine-kicker">LA TABLA NO MIENTE</p>
						<h2 className="cine-h2">
							LOS <em>CAPOS</em>
						</h2>
					</Reveal>
					<div className="cine-top">
						{top.map((mc, index) => (
							<Reveal key={mc.id} delay={index * 100}>
								<TransitionLink href={`/perfil/${encodeURIComponent(mc.handle)}`} className="cine-top-row">
									<span className="pos">{String(index + 1).padStart(2, "0")}</span>
									<span className="handle">{mc.handle.toUpperCase()}</span>
									<span className="elo">
										{mc.elo}
										<small>ELO</small>
									</span>
								</TransitionLink>
							</Reveal>
						))}
					</div>
					<Reveal delay={250} className="cine-center">
						<TransitionLink href="/ranking" className="btn-ghost">
							RANKING COMPLETO →
						</TransitionLink>
					</Reveal>
				</section>
			)}

			{/* ============ ACTO FINAL: CTA ============ */}
			<section className="cine-final">
				<div className="cine-final-marquee" aria-hidden="true">
					<div className="track">
						{Array.from({ length: 8 }, (_, i) => (
							<span key={i}>
								DEMOSTRALO EN LA ARENA <span className="x">✕</span>
							</span>
						))}
					</div>
				</div>
				<Reveal className="cine-final-inner">
					<h2 className="cine-final-title">¿TENÉS BARRAS?</h2>
					<TransitionLink href="/arena" className="btn-arena cine-cta">
						<span>BUSCAR RIVAL AHORA →</span>
					</TransitionLink>
					<p className="cine-final-note">GRATIS · SIN DESCARGAS · SOLO TU VOZ</p>
				</Reveal>
				<div className="arena-stripe" />
			</section>
		</main>
	);
}
