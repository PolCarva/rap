"use client";

import { useEffect, useRef } from "react";

interface Props {
	redChance?: number;
	count?: number;
}

export function SmokeCanvas({ redChance = 0.3, count = 16 }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const TINT: [number, number, number] = [232, 25, 44];
		let W = 0, H = 0;
		let animId: number;

		interface Particle {
			x: number; y: number; r: number;
			vx: number; vy: number;
			a: number; maxA: number;
			red: boolean; life: number;
		}

		function resize() {
			W = canvas!.width = canvas!.offsetWidth * 0.5;
			H = canvas!.height = canvas!.offsetHeight * 0.5;
		}

		function spawn(initial: boolean): Particle {
			const r = 90 + Math.random() * 190;
			return {
				x: Math.random() * W,
				y: initial ? Math.random() * H : H + r,
				r,
				vx: (Math.random() - 0.5) * 0.16,
				vy: -(0.10 + Math.random() * 0.30),
				a: 0,
				maxA: 0.05 + Math.random() * 0.09,
				red: Math.random() < redChance,
				life: 0,
			};
		}

		resize();
		window.addEventListener("resize", resize);

		const parts: Particle[] = Array.from({ length: count }, () => spawn(true));

		function frame() {
			ctx!.clearRect(0, 0, W, H);
			for (let i = 0; i < parts.length; i++) {
				const p = parts[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life++;
				p.a = Math.min(p.maxA, p.a + 0.0008);
				if (p.y + p.r < -40) { parts[i] = spawn(false); continue; }
				const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
				const c = p.red ? TINT.join(",") : "120,118,124";
				g.addColorStop(0, `rgba(${c},${p.a})`);
				g.addColorStop(1, `rgba(${c},0)`);
				ctx!.fillStyle = g;
				ctx!.beginPath();
				ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
				ctx!.fill();
			}
			animId = requestAnimationFrame(frame);
		}

		frame();

		return () => {
			cancelAnimationFrame(animId);
			window.removeEventListener("resize", resize);
		};
	}, [count, redChance]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: "fixed",
				inset: 0,
				width: "100%",
				height: "100%",
				zIndex: 1,
				pointerEvents: "none",
			}}
		/>
	);
}
