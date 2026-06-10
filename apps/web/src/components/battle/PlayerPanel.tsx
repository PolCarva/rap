"use client";

import type { PlayerState } from "@rap/shared";
import { useEffect, useRef, useState } from "react";
import { RhymeText } from "./RhymeText";

interface Props {
	player: PlayerState;
	isSelf: boolean;
	isActive: boolean;
	caption: string;
	verses: string[];
	mirror?: boolean;
	stream?: MediaStream | null;
	videoMuted?: boolean;
	mediaStatus?: string;
	remaining?: number | null;
}

export function PlayerPanel({ player, isSelf, isActive, caption, mirror, stream, videoMuted, remaining }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const subtitlePreviewRef = useRef<HTMLDivElement>(null);
	const [showFullTranscript, setShowFullTranscript] = useState(false);

	useEffect(() => {
		if (videoRef.current && stream) videoRef.current.srcObject = stream;
	}, [stream]);

	useEffect(() => {
		if (!caption) setShowFullTranscript(false);
		subtitlePreviewRef.current?.scrollTo({
			top: subtitlePreviewRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [caption]);

	const sideClass = isSelf ? "me" : "rival-side";
	const activeClass = isActive ? " active" : " dimmed";
	const timerLow = remaining !== null && remaining !== undefined && remaining <= 5;

	return (
		<div className={`fighter ${sideClass}${activeClass}`}>
			{/* Video / placeholder */}
			{stream ? (
				<video
					ref={videoRef}
					autoPlay
					muted={videoMuted ?? isSelf}
					playsInline
					style={mirror ? { transform: "scaleX(-1) scaleX(-1)" } : undefined}
				/>
			) : (
				<div className={isSelf ? "fighter-no-signal" : "rival-visual"}>
					{isSelf ? (
						<>
							<div className="big">SIN SEÑAL</div>
							<div>CÁMARA NO DISPONIBLE</div>
						</>
					) : (
						<div className="rival-silhouette" />
					)}
				</div>
			)}

			{/* Scanlines */}
			<div className="arena-scanlines" />

			{/* Name plate */}
			<div className="fighter-plate">
				<div className="fighter-aka">{player.name || (isSelf ? "TÚ" : "???")}</div>
				<div className="fighter-tag">
					{isSelf ? "LOCAL · EN VIVO" : "RIVAL · CONECTADO"}
					{!player.connected && " · DESCONECTADO"}
				</div>
			</div>

			{/* Timer */}
			{remaining !== undefined && (
				<div className={`fighter-timer${timerLow ? " low" : ""}`}>
					{remaining === null ? "--" : `${remaining}s`}
				</div>
			)}

			{/* Live transcript */}
			{caption && (
				<div className={`fighter-transcript${showFullTranscript ? " expanded" : ""}`}>
					<div ref={subtitlePreviewRef} className="subtitle-preview" aria-label="Subtítulos en vivo">
						<div className="line"><RhymeText text={caption} /></div>
					</div>
					<button
						type="button"
						className="subtitle-toggle"
						onClick={() => setShowFullTranscript((open) => !open)}
					>
						{showFullTranscript ? "Cerrar" : "Ver todo"}
					</button>
					{showFullTranscript && (
						<div className="subtitle-full" role="dialog" aria-label="Transcripción completa">
							<div className="line"><RhymeText text={caption} /></div>
						</div>
					)}
				</div>
			)}

			{/* Dim overlay */}
			<div className="fighter-dim">
				<div className="fighter-muted-tag">
					{isSelf ? "🔇 MIC CERRADO — TURNO DEL RIVAL" : "🔇 SILENCIADO — TU TURNO"}
				</div>
			</div>
		</div>
	);
}
