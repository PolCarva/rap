"use client";

import type { PlayerState } from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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

function isReceivingTrack(track: MediaStreamTrack): boolean {
	return track.readyState === "live" && !track.muted;
}

export function PlayerPanel({ player, isSelf, isActive, caption, mirror, stream, videoMuted, isBot, mediaStatus, remaining }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const subtitlePreviewRef = useRef<HTMLDivElement>(null);
	const [showFullTranscript, setShowFullTranscript] = useState(false);
	const [videoReady, setVideoReady] = useState(false);
	const [mediaSnapshot, setMediaSnapshot] = useState({ hasLiveTrack: false, hasLiveAudio: false, hasLiveVideo: false });
	const videoElementMuted = !isSelf && !(videoMuted ?? false) ? true : (videoMuted ?? isSelf);

	const updateVideoReady = useCallback(() => {
		const video = videoRef.current;
		setVideoReady(Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0));
	}, []);

	useEffect(() => {
		const update = () => {
			const tracks = stream?.getTracks() ?? [];
			const receiving = tracks.filter(isReceivingTrack);
			setMediaSnapshot({
				hasLiveTrack: receiving.length > 0,
				hasLiveAudio: receiving.some((track) => track.kind === "audio"),
				hasLiveVideo: receiving.some((track) => track.kind === "video"),
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
		setVideoReady(false);
		if (!stream) {
			video.srcObject = null;
			return;
		}
		if (video.srcObject !== stream) video.srcObject = stream;
		video.muted = videoElementMuted;
		const onVideoReady = () => updateVideoReady();
		video.addEventListener("loadedmetadata", onVideoReady);
		video.addEventListener("loadeddata", onVideoReady);
		video.addEventListener("canplay", onVideoReady);
		video.addEventListener("playing", onVideoReady);
		video.addEventListener("resize", onVideoReady);
		const play = async () => {
			try {
				await video.play();
				updateVideoReady();
			} catch {
				// Si el navegador bloquea autoplay con audio remoto, priorizamos
				// mostrar la cámara y dejamos el elemento muteado.
				video.muted = true;
				await video.play().then(updateVideoReady).catch(() => {});
			}
		};
		void play();
		return () => {
			video.removeEventListener("loadedmetadata", onVideoReady);
			video.removeEventListener("loadeddata", onVideoReady);
			video.removeEventListener("canplay", onVideoReady);
			video.removeEventListener("playing", onVideoReady);
			video.removeEventListener("resize", onVideoReady);
		};
	}, [stream, updateVideoReady, videoElementMuted]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (!stream || isSelf || (videoMuted ?? false)) {
			audio.srcObject = null;
			return;
		}
		if (audio.srcObject !== stream) audio.srcObject = stream;
		audio.muted = false;
		void audio.play().catch(() => {});
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
	const shouldRenderRemoteAudio = !!stream && !isSelf && !(videoMuted ?? false);
	const hasVisibleVideo = mediaSnapshot.hasLiveVideo && videoReady;
	const showPlaceholder = !stream || !hasVisibleVideo;
	const rivalMediaLabel =
		mediaStatus ??
		(stream && !mediaSnapshot.hasLiveVideo
			? "conectando video"
			: stream && mediaSnapshot.hasLiveVideo && !videoReady
				? "esperando imagen"
				: null);

	return (
		<div className={`fighter ${sideClass}${activeClass}`}>
			{/* Video / placeholder */}
			{shouldRenderRemoteAudio && <audio ref={audioRef} autoPlay className="fighter-remote-audio" />}
			{shouldRenderVideo && (
				<video
					ref={videoRef}
					autoPlay
					muted={videoElementMuted}
					playsInline
					className={!hasVisibleVideo ? "fighter-video-waiting" : undefined}
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
