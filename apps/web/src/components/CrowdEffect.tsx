"use client";

import { useEffect, useRef } from "react";

export function CrowdEffect({ count = 40 }: { count?: number }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.innerHTML = "";
		const w = el.offsetWidth || window.innerWidth;
		for (let i = 0; i < count; i++) {
			const head = document.createElement("div");
			head.className = "crowd-head";
			const size = 36 + Math.random() * 54;
			head.style.width = `${size}px`;
			head.style.height = `${size * (1.1 + Math.random() * 0.7)}px`;
			head.style.animationDelay = `${Math.random() * -0.66}s`;
			head.style.animationDuration = `${0.55 + Math.random() * 0.35}s`;
			el.appendChild(head);

			if (Math.random() < 0.35) {
				const arm = document.createElement("div");
				arm.style.cssText = `position:absolute;bottom:30px;width:7px;height:60px;background:#030305;border-radius:4px;transform-origin:bottom center;left:${Math.random() * w}px;animation:wave ${0.55 + Math.random() * 0.35}s ease-in-out ${Math.random() * -0.66}s infinite alternate;`;
				el.appendChild(arm);
			}
		}
	}, [count]);

	return (
		<div
			ref={ref}
			style={{
				position: "fixed",
				left: 0,
				right: 0,
				bottom: -6,
				zIndex: 50,
				height: 110,
				pointerEvents: "none",
				display: "flex",
				alignItems: "flex-end",
				justifyContent: "center",
				filter: "blur(1.5px)",
			}}
		/>
	);
}
