"use client";

import { analyzeRhymes, RHYME_COLORS } from "@rap/shared";
import { useMemo } from "react";

/**
 * Renderiza texto coloreando las sílabas que riman (rimas de final y patrones
 * multisilábicos). El análisis es local e instantáneo (sin API).
 */
export function RhymeText({ text, className }: { text: string; className?: string }) {
	const segments = useMemo(() => analyzeRhymes(text), [text]);
	return (
		<span className={className}>
			{segments.map((s, i) =>
				s.group === null ? (
					<span key={i}>{s.text}</span>
				) : (
					<span
						key={i}
						style={{ color: RHYME_COLORS[s.group % RHYME_COLORS.length], fontWeight: 700 }}
					>
						{s.text}
					</span>
				),
			)}
		</span>
	);
}
