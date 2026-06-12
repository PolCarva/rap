"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor custom: punto rojo + anillo con retardo (lerp). El anillo se expande
 * sobre elementos interactivos y se contrae al click. Solo en punteros finos;
 * en touch no se monta nada.
 */
export function CinematicCursor() {
	const dotRef = useRef<HTMLDivElement>(null);
	const ringRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!window.matchMedia("(pointer: fine)").matches) return;
		const dot = dotRef.current;
		const ring = ringRef.current;
		if (!dot || !ring) return;

		document.documentElement.classList.add("custom-cursor");

		let mx = window.innerWidth / 2;
		let my = window.innerHeight / 2;
		let rx = mx;
		let ry = my;
		let raf = 0;
		let hovering = false;
		let pressing = false;
		let visible = false;

		const isInteractive = (el: Element | null): boolean =>
			!!el?.closest("a, button, [role=button], input, textarea, select, label, .beat-card");

		const onMove = (e: MouseEvent) => {
			mx = e.clientX;
			my = e.clientY;
			if (!visible) {
				visible = true;
				dot.style.opacity = "1";
				ring.style.opacity = "1";
			}
			hovering = isInteractive(e.target as Element);
		};
		const onDown = () => {
			pressing = true;
		};
		const onUp = () => {
			pressing = false;
		};
		const onLeave = () => {
			visible = false;
			dot.style.opacity = "0";
			ring.style.opacity = "0";
		};

		const tick = () => {
			rx += (mx - rx) * 0.16;
			ry += (my - ry) * 0.16;
			dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
			const scale = pressing ? 0.7 : hovering ? 1.9 : 1;
			ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${scale})`;
			ring.classList.toggle("hot", hovering);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);

		window.addEventListener("mousemove", onMove, { passive: true });
		window.addEventListener("mousedown", onDown);
		window.addEventListener("mouseup", onUp);
		document.documentElement.addEventListener("mouseleave", onLeave);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("mouseup", onUp);
			document.documentElement.removeEventListener("mouseleave", onLeave);
			document.documentElement.classList.remove("custom-cursor");
		};
	}, []);

	return (
		<>
			<div ref={dotRef} className="cursor-dot" aria-hidden="true" />
			<div ref={ringRef} className="cursor-ring" aria-hidden="true" />
		</>
	);
}
