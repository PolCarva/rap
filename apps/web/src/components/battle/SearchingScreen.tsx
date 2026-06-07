"use client";

import { MODALITIES, type ModalityId } from "@rap/shared";

interface Props {
	modality: ModalityId;
	onCancel: () => void;
}

export function SearchingScreen({ modality, onCancel }: Props) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
			<div className="relative flex h-40 w-40 items-center justify-center">
				<div className="animate-battle-pulse absolute inset-0 rounded-full bg-gradient-to-r from-fuchsia-500/40 to-cyan-500/40 blur-xl" />
				<div className="relative text-4xl">🎤</div>
			</div>
			<div className="text-center">
				<h2 className="text-2xl font-bold">Buscando rival…</h2>
				<p className="mt-1 text-sm text-white/50">
					Modalidad: <span className="text-fuchsia-300">{MODALITIES[modality].name}</span>
				</p>
				<p className="mt-4 text-xs text-white/30">
					Abrí esta página en otra pestaña con la misma modalidad para emparejarte.
				</p>
			</div>
			<button
				onClick={onCancel}
				className="rounded-lg border border-white/15 px-5 py-2 text-sm text-white/70 hover:bg-white/5"
			>
				Cancelar
			</button>
		</div>
	);
}
