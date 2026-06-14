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
	isBot?: boolean;
	mediaStatus?: string;
	remaining?: number | null;
}

export function PlayerPanel({ player, isSelf, isActive, caption, mirror, stream, videoMuted, isBot, mediaStatus, remaining }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const subtitlePreviewRef = useRef<HTMLDivElement>(null);
	const [showFullTranscript, setShowFullTranscript] = useState(false);
	const [mediaSnapshot, setMediaSnapshot] = useState({ hasLiveTrack: false, hasLiveVideo: false });

	useEffect(() => {
		const update = () => {
			const tracks = stream?.getTracks() ?? [];
			setMediaSnapshot({
				hasLiveTrack: tracks.some((track) => track.readyState === "live"),
				hasLiveVideo: tracks.some((track) => track.kind === "video" && track.readyState === "live"),
			});
		};
		update();
		if (!stream) return;
		const tracks = stream.getTracks();
		stream.addEventListener("addtrack", update);
		stream.addEventListener("removetrack", update);
		for (const track of tracks) {
			track.addEventListener("ended", update);
			track.addEventListener("mute", update);
			track.addEventListener("unmute", update);
		}
		return () => {
			stream.removeEventListener("addtrack", update);
			stream.removeEventListener("removetrack", update);
			for (const track of tracks) {
				track.removeEventListener("ended", update);
				track.removeEventListener("mute", update);
				track.removeEventListener("unmute", update);
			}
		};
	}, [stream]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (!stream) {
			video.srcObject = null;
			return;
		}
		if (video.srcObject !== stream) video.srcObject = stream;
		video.muted = videoMuted ?? isSelf;
		const play = async () => {
			try {
				await video.play();
			} catch {
				// Si el navegador bloquea autoplay con audio remoto, priorizamos
				// mostrar la cámara y dejamos el elemento muteado.
				video.muted = true;
				await video.play().catch(() => {});
			}
		};
		void play();
	}, [isSelf, stream, videoMuted]);

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
	const shouldRenderVideo = !!stream;
	const showPlaceholder = !stream || !mediaSnapshot.hasLiveVideo;
	const rivalMediaLabel = mediaStatus ?? (stream && !mediaSnapshot.hasLiveVideo ? "conectando video" : null);

	return (
		<div className={`fighter ${sideClass}${activeClass}`}>
			{/* Video / placeholder */}
			{shouldRenderVideo && (
				<video
					ref={videoRef}
					autoPlay
					muted={videoMuted ?? isSelf}
					playsInline
					className={!mediaSnapshot.hasLiveVideo ? "fighter-video-waiting" : undefined}
					style={mirror ? { transform: "scaleX(-1)" } : undefined}
				/>
			)}
			{showPlaceholder && (
				<div className={isSelf ? "fighter-no-signal" : "rival-visual"}>
					{isSelf ? (
						<>
							<div className="big">SIN SEÑAL</div>
							<div>CÁMARA NO DISPONIBLE</div>
						</>
					) : (
						<>
							<div className="rival-silhouette" />
							{isBot && <div>BOT DE PRUEBA</div>}
							{!isBot && rivalMediaLabel && <div>{rivalMediaLabel.toUpperCase()}</div>}
						</>
					)}
				</div>
			)}

			{/* Scanlines */}
			<div className="arena-scanlines" />

			{/* Name plate */}
			<div className="fighter-plate">
				<div className="fighter-aka">{player.name || (isSelf ? "TÚ" : "???")}</div>
				<div className="fighter-tag">
					{isSelf ? "LOCAL · EN VIVO" : isBot ? "BOT · DEV" : "RIVAL · CONECTADO"}
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
