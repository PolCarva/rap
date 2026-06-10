"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MediaStatus = "idle" | "requesting" | "ready" | "denied";

/**
 * Prueba local de cámara y micrófono. Devuelve el stream para previsualizar y
 * un nivel de audio en vivo (0..1) para mostrar que el mic capta. Sin transporte:
 * el envío por SFU llega en el paso de WebRTC.
 */
export function useMediaStream() {
	const [status, setStatus] = useState<MediaStatus>("idle");
	const [audioLevel, setAudioLevel] = useState(0);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const userStoppedRef = useRef(false);

	const stopAudioMeter = useCallback(() => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
		audioCtxRef.current?.close().catch(() => {});
		audioCtxRef.current = null;
	}, []);

	const startAudioMeter = useCallback((stream: MediaStream) => {
		stopAudioMeter();
		const audioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
		if (audioTracks.length === 0) return;

		const AudioCtor =
			window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		const ctx = new AudioCtor();
		audioCtxRef.current = ctx;
		const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		source.connect(analyser);
		const data = new Uint8Array(analyser.frequencyBinCount);
		const tick = () => {
			analyser.getByteTimeDomainData(data);
			let sum = 0;
			for (const v of data) sum += (v - 128) * (v - 128);
			setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
			rafRef.current = requestAnimationFrame(tick);
		};
		tick();
	}, [stopAudioMeter]);

	const stop = useCallback(() => {
		userStoppedRef.current = true;
		stopAudioMeter();
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		setAudioLevel(0);
		setStatus("idle");
	}, [stopAudioMeter]);

	const start = useCallback(async () => {
		userStoppedRef.current = false;
		setStatus("requesting");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
			streamRef.current = stream;
			setStatus("ready");
			startAudioMeter(stream);
		} catch {
			setStatus("denied");
		}
	}, [startAudioMeter]);

	const ensureActive = useCallback(async () => {
		if (userStoppedRef.current || status === "requesting" || status === "denied") return;

		const stream = streamRef.current;
		const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
		const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;

		if (!stream || !hasLiveVideo) {
			await start();
			return;
		}

		if (!hasLiveAudio) {
			try {
				const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
				audioOnly.getAudioTracks().forEach((track) => stream.addTrack(track));
				startAudioMeter(stream);
				setStatus("ready");
			} catch {
				setStatus("denied");
			}
		}
	}, [status, start, startAudioMeter]);

	/**
	 * Libera SOLO el micrófono (corta el audio track) y mantiene el video.
	 * Necesario para que Web Speech pueda usar el mic sin contención.
	 */
	const releaseAudio = useCallback(() => {
		stopAudioMeter();
		streamRef.current?.getAudioTracks().forEach((t) => t.stop());
		setAudioLevel(0);
	}, [stopAudioMeter]);

	useEffect(() => () => stop(), [stop]);

	return { status, audioLevel, stream: streamRef, start, stop, ensureActive, releaseAudio };
}

export type MediaController = ReturnType<typeof useMediaStream>;
