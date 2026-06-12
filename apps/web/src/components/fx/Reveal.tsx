"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Revela el contenido cuando entra al viewport (clase .in). El estilo de la
 * revelación lo decide el CSS del hijo via la clase `reveal` + modificadores.
 */
export function Reveal({
	children,
	className = "",
	delay = 0,
	as: Tag = "div",
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
	as?: "div" | "section" | "h2" | "p" | "li" | "span";
}) {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						el.classList.add("in");
						io.disconnect();
					}
				}
			},
			{ threshold: 0.18 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	return (
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		<Tag ref={ref as any} className={`reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
			{children}
		</Tag>
	);
}
