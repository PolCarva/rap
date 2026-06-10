"use client";

import { useEffect, useRef } from "react";

const REACTIONS = ["OHH", "UH", "WOOO", "¡ESO!", "¡FUEGO!", "¡DALE!", "BOO", "UHH", "¡FLOW!", "¡MODO DIOS!"];

function spawnReaction(container: HTMLElement) {
	const el = document.createElement("div");
	el.textContent = REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!;
	const x = 10 + Math.random() * 80;
	Object.assign(el.style, {
		position: "absolute",
		left: `${x}%`,
		bottom: "0",
		fontFamily: "var(--font-display)",
		fontSize: `${22 + Math.random() * 24}px`,
		fontWeight: 900,
		letterSpacing: "0.06em",
		color: Math.random() < 0.25 ? "var(--red)" : "var(--bone)",
		textShadow: "0 0 12px rgba(0,0,0,0.9)",
		pointerEvents: "none",
		whiteSpace: "nowrap",
		animation: `crowd-react-rise ${1.4 + Math.random() * 0.6}s ease-out forwards`,
		opacity: "1",
		zIndex: "200",
	});
	container.appendChild(el);
	el.addEventListener("animationend", () => el.remove());
}

/** Floats crowd onomatopoeias during a battle. Pass active=true while a turn is running. */
export function CrowdReactions({ active }: { active: boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!active || !ref.current) return;
		const container = ref.current;

		function schedule() {
			if (ref.current) spawnReaction(container);
			timerRef.current = setTimeout(schedule, 6000 + Math.random() * 9000);
		}
		// First reaction after a short delay
		timerRef.current = setTimeout(schedule, 3000 + Math.random() * 5000);
		return () => { if (timerRef.current) clearTimeout(timerRef.current); };
	}, [active]);

	return (
		<div
			ref={ref}
			style={{
				position: "absolute",
				inset: 0,
				overflow: "hidden",
				pointerEvents: "none",
				zIndex: 200,
			}}
		/>
	);
}
