"use client";

import type { PlayerState } from "@rap/shared";
import { useEffect, useRef } from "react";

interface Props {
	player: PlayerState;
	isSelf: boolean;
	isActive: boolean;
	caption: string;
	verses: string[];
	mirror?: boolean;
	/** Stream local de cámara para mostrar el propio video (sin SFU). */
	stream?: MediaStream | null;
}

export function PlayerPanel({ player, isSelf, isActive, caption, verses, mirror, stream }: Props) {
	const initials = player.name.slice(0, 2).toUpperCase() || "??";
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (videoRef.current && stream) videoRef.current.srcObject = stream;
	}, [stream]);
	return (
		<div
			className={`relative flex flex-1 flex-col overflow-hidden rounded-2xl border bg-black/40 transition ${
				isActive ? "border-fuchsia-400/80 shadow-[0_0_40px_-10px] shadow-fuchsia-500/60" : "border-white/10"
			}`}
		>
			{/* Video propio (local). El video del rival llega con el SFU (paso 4). */}
			<div className={`relative flex aspect-video items-center justify-center bg-gradient-to-br from-white/[0.06] to-transparent ${mirror ? "-scale-x-100" : ""}`}>
				{isSelf && stream ? (
					<video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
				) : (
					<div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500/40 to-cyan-500/40 text-2xl font-black">
						{initials}
					</div>
				)}
				{!isSelf && (
					<span className="absolute bottom-2 right-2 text-[10px] text-white/30">📹 cámara: SFU (paso 4)</span>
				)}
				{isActive && (
					<span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> RAPEANDO
					</span>
				)}
			</div>

			<div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
				<span className="font-bold">
					{player.name} {isSelf && <span className="text-xs text-white/40">(vos)</span>}
				</span>
				<span
					className={`text-[10px] font-semibold uppercase ${
						!player.connected ? "text-white/30" : player.ready ? "text-emerald-400" : "text-amber-400"
					}`}
				>
					{!player.connected ? "desconectado" : player.ready ? "listo" : "conectado"}
				</span>
			</div>

			{/* Subtítulo en vivo */}
			<div className="min-h-[3rem] border-t border-white/10 bg-black/30 px-4 py-2 text-sm">
				{caption ? (
					<span className="text-cyan-200">{caption}</span>
				) : (
					<span className="text-white/20">—</span>
				)}
			</div>

			{/* Versos enviados */}
			{verses.length > 0 && (
				<div className="max-h-28 overflow-y-auto border-t border-white/10 px-4 py-2 text-xs text-white/50">
					{verses.map((v, i) => (
						<div key={i} className="truncate">
							<span className="text-white/30">R{i + 1}:</span> {v || <em className="text-white/20">(sin verso)</em>}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
