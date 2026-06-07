"use client";

import { MODALITIES, MODALITY_IDS, type ModalityId } from "@rap/shared";
import { useEffect, useRef, useState } from "react";
import type { MediaController } from "./useMediaStream";

interface Props {
	error: string | null;
	media: MediaController;
	onSearch: (name: string, modality: ModalityId) => void;
}

export function SetupScreen({ error, media, onSearch }: Props) {
	const [name, setName] = useState("");
	const [modality, setModality] = useState<ModalityId>("minuto-libre");
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (media.status === "ready" && videoRef.current && media.stream.current) {
			videoRef.current.srcObject = media.stream.current;
		}
	}, [media.status, media.stream]);

	const canSearch = name.trim().length > 0;

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
			<header className="text-center">
				<h1 className="bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-5xl font-black tracking-tight text-transparent">
					RAP ARENA
				</h1>
				<p className="mt-2 text-sm text-white/50">Buscá batalla. Rapeá. Que decida el juez.</p>
			</header>

			{/* Prueba de cámara y micrófono */}
			<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
					1 · Probá cámara y micrófono
				</h2>
				<div className="flex flex-col items-center gap-4 sm:flex-row">
					<div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-xl bg-black/60 ring-1 ring-white/10">
						{media.status === "ready" ? (
							<video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
						) : (
							<div className="flex h-full items-center justify-center text-xs text-white/40">
								{media.status === "denied" ? "Permiso denegado" : "Cámara apagada"}
							</div>
						)}
					</div>
					<div className="flex w-full flex-col gap-3">
						{media.status === "ready" ? (
							<button
								onClick={media.stop}
								className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
							>
								Apagar cámara
							</button>
						) : (
							<button
								onClick={media.start}
								className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15"
							>
								{media.status === "requesting" ? "Pidiendo permiso…" : "Encender cámara y mic"}
							</button>
						)}
						<div>
							<div className="mb-1 text-xs text-white/40">Nivel de micrófono</div>
							<div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
								<div
									className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-[width] duration-75"
									style={{ width: `${Math.round(media.audioLevel * 100)}%` }}
								/>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Nombre */}
			<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
					2 · Tu nombre de MC
				</h2>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={40}
					placeholder="MC..."
					className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-lg outline-none focus:border-fuchsia-400/60"
				/>
			</section>

			{/* Modalidad */}
			<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
					3 · Elegí modalidad
				</h2>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{MODALITY_IDS.map((id) => {
						const m = MODALITIES[id];
						const active = id === modality;
						return (
							<button
								key={id}
								onClick={() => setModality(id)}
								className={`rounded-xl border p-4 text-left transition ${
									active
										? "border-fuchsia-400/70 bg-fuchsia-500/10"
										: "border-white/10 bg-black/20 hover:border-white/25"
								}`}
							>
								<div className="flex items-center justify-between">
									<span className="font-bold">{m.name}</span>
									<span className="text-xs text-white/40">
										{m.rounds} ×{m.turnDurationSec}s
									</span>
								</div>
								<p className="mt-1 text-xs text-white/50">{m.description}</p>
							</button>
						);
					})}
				</div>
			</section>

			{error && (
				<p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
					{error}
				</p>
			)}

			<button
				disabled={!canSearch}
				onClick={() => onSearch(name.trim(), modality)}
				className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-6 py-4 text-lg font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-110"
			>
				Buscar batalla
			</button>
		</div>
	);
}
