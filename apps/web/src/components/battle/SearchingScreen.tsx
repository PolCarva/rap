"use client";

import { MODALITIES, type ModalityId } from "@rap/shared";
import { useEffect, useState } from "react";
import { usePlayerCounts } from "@/components/usePlayerCounts";

interface Props {
	modality: ModalityId;
	onCancel: () => void;
}

const TIPS = [
	"CALENTÁ LA VOZ: EL PRIMER VERSO MARCA EL RITMO",
	"ESCUCHÁ EL BEAT ANTES DE ENTRAR: CAÉ EN EL TEMPO",
	"LAS RIMAS MULTISILÁBICAS PUNTÚAN MÁS ALTO",
	"RESPONDÉ LO QUE DIJO TU RIVAL: EL JUEZ LO PREMIA",
	"REMATÁ CADA RONDA CON TU MEJOR PUNCHLINE",
];

export function SearchingScreen({ modality, onCancel }: Props) {
	const counts = usePlayerCounts();
	const [tipIndex, setTipIndex] = useState(0);
	const [seconds, setSeconds] = useState(0);

	useEffect(() => {
		const tip = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4200);
		const sec = setInterval(() => setSeconds((s) => s + 1), 1000);
		return () => {
			clearInterval(tip);
			clearInterval(sec);
		};
	}, []);

	const waiting = counts.byModality[modality] ?? 0;

	return (
		<div className="battle-phase">
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<div className="battle-radar">
				<div className="core" />
			</div>
			<div className="battle-searching-title">
				BUSCANDO RIVAL<span className="red">…</span>
			</div>
			<div className="battle-searching-sub">
				MODO: {MODALITIES[modality].name.toUpperCase()} · {String(Math.floor(seconds / 60)).padStart(2, "0")}:
				{String(seconds % 60).padStart(2, "0")}
			</div>
			{waiting > 0 && (
				<div className="searching-live">
					<span className="arena-live-dot" style={{ margin: 0 }} />
					{waiting} MC{waiting === 1 ? "" : "S"} EN COLA EN ESTE MODO
				</div>
			)}
			<p key={tipIndex} className="searching-tip">
				{TIPS[tipIndex]}
			</p>
			<button onClick={onCancel} className="btn-ghost">
				CANCELAR BÚSQUEDA
			</button>
		</div>
	);
}
