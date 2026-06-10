"use client";

import { MODALITIES, type ModalityId } from "@rap/shared";

interface Props {
	modality: ModalityId;
	onCancel: () => void;
}

export function SearchingScreen({ modality, onCancel }: Props) {
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
				MODO: {MODALITIES[modality].name.toUpperCase()}
			</div>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--bone-dim)", maxWidth: 360, textAlign: "center" }}>
				ABRE ESTA PÁGINA EN OTRA PESTAÑA CON LA MISMA MODALIDAD PARA EMPAREJARTE
			</p>
			<button onClick={onCancel} className="btn-ghost">
				CANCELAR BÚSQUEDA
			</button>
		</div>
	);
}
