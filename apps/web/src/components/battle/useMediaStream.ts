"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MediaStatus = "idle" | "requesting" | "ready" | "denied";

export interface MediaRequirements {
	audio: boolean;
	video: boolean;
}

const DEFAULT_REQUIREMENTS: MediaRequirements = { audio: true, video: true };

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
	width: { ideal: 960, max: 1280 },
	height: { ideal: 540, max: 720 },
	frameRate: { ideal: 24, max: 30 },
	facingMode: "user",
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
};

function withDeviceId(base: MediaTrackConstraints, deviceId: string): MediaTrackConstraints {
	return deviceId ? { ...base, deviceId: { exact: deviceId } } : base;
}

function constraintsFor(requirements: MediaRequirements, audioDeviceId: string, videoDeviceId: string): MediaStreamConstraints {
	return {
		audio: requirements.audio ? withDeviceId(AUDIO_CONSTRAINTS, audioDeviceId) : false,
		video: requirements.video ? withDeviceId(VIDEO_CONSTRAINTS, videoDeviceId) : false,
	};
}

/**
 * Prueba local de cámara y micrófono. Devuelve el stream para previsualizar y
 * un nivel de audio en vivo (0..1) para mostrar que el mic capta. Sin transporte:
 * el envío por SFU llega en el paso de WebRTC.
 */
export function useMediaStream() {
	const [status, setStatus] = useState<MediaStatus>("idle");
	const [audioLevel, setAudioLevel] = useState(0);
	const [version, setVersion] = useState(0);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedAudioId, setSelectedAudioIdState] = useState("");
	const [selectedVideoId, setSelectedVideoIdState] = useState("");
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const userStoppedRef = useRef(false);
	const lastRequirementsRef = useRef<MediaRequirements>(DEFAULT_REQUIREMENTS);
	const selectedAudioIdRef = useRef("");
	const selectedVideoIdRef = useRef("");

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

	const refreshDevices = useCallback(async () => {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		try {
			const allDevices = await navigator.mediaDevices.enumerateDevices();
			const mediaDevices = allDevices.filter((device) => device.kind === "audioinput" || device.kind === "videoinput");
			setDevices(mediaDevices);
			const audioStillExists =
				!selectedAudioIdRef.current ||
				mediaDevices.some((device) => device.kind === "audioinput" && device.deviceId === selectedAudioIdRef.current);
			const videoStillExists =
				!selectedVideoIdRef.current ||
				mediaDevices.some((device) => device.kind === "videoinput" && device.deviceId === selectedVideoIdRef.current);
			if (!audioStillExists) {
				selectedAudioIdRef.current = "";
				setSelectedAudioIdState("");
			}
			if (!videoStillExists) {
				selectedVideoIdRef.current = "";
				setSelectedVideoIdState("");
			}
		} catch {
			setDevices([]);
		}
	}, []);

	const setSelectedAudioId = useCallback((deviceId: string) => {
		selectedAudioIdRef.current = deviceId;
		setSelectedAudioIdState(deviceId);
	}, []);

	const setSelectedVideoId = useCallback((deviceId: string) => {
		selectedVideoIdRef.current = deviceId;
		setSelectedVideoIdState(deviceId);
	}, []);

	const stop = useCallback(() => {
		userStoppedRef.current = true;
		stopAudioMeter();
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		setVersion((v) => v + 1);
		setAudioLevel(0);
		setStatus("idle");
	}, [stopAudioMeter]);

	const start = useCallback(async (requirements: MediaRequirements = lastRequirementsRef.current) => {
		userStoppedRef.current = false;
		lastRequirementsRef.current = requirements;
		setStatus("requesting");
		try {
			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getUserMedia(
					constraintsFor(requirements, selectedAudioIdRef.current, selectedVideoIdRef.current),
				);
			} catch (error) {
				if (!selectedAudioIdRef.current && !selectedVideoIdRef.current) throw error;
				stream = await navigator.mediaDevices.getUserMedia(constraintsFor(requirements, "", ""));
				setSelectedAudioId("");
				setSelectedVideoId("");
			}
			streamRef.current?.getTracks().forEach((t) => t.stop());
			streamRef.current = stream;
			setVersion((v) => v + 1);
			setStatus("ready");
			startAudioMeter(stream);
			void refreshDevices();
		} catch {
			setStatus("denied");
		}
	}, [refreshDevices, setSelectedAudioId, setSelectedVideoId, startAudioMeter]);

	const ensureActive = useCallback(async (requirements: MediaRequirements = lastRequirementsRef.current) => {
		lastRequirementsRef.current = requirements;
		if (userStoppedRef.current || status === "requesting" || status === "denied") return;

		const stream = streamRef.current;
		const endedTracks = stream?.getTracks().filter((track) => track.readyState !== "live") ?? [];
		endedTracks.forEach((track) => stream?.removeTrack(track));
		if (endedTracks.length > 0) setVersion((v) => v + 1);
		const hasLiveAudio = !requirements.audio || (stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false);
		const hasLiveVideo = !requirements.video || (stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false);

		if (!stream || !hasLiveAudio || !hasLiveVideo) {
			await start(requirements);
			return;
		}

		if (endedTracks.length > 0) startAudioMeter(stream);
	}, [status, start, startAudioMeter]);

	const selectAudioDevice = useCallback(
		async (deviceId: string, requirements: MediaRequirements = lastRequirementsRef.current) => {
			setSelectedAudioId(deviceId);
			if (streamRef.current && requirements.audio) {
				await start(requirements);
			}
		},
		[setSelectedAudioId, start],
	);

	const selectVideoDevice = useCallback(
		async (deviceId: string, requirements: MediaRequirements = lastRequirementsRef.current) => {
			setSelectedVideoId(deviceId);
			if (streamRef.current && requirements.video) {
				await start(requirements);
			}
		},
		[setSelectedVideoId, start],
	);

	/**
	 * Libera SOLO el micrófono (corta el audio track) y mantiene el video.
	 * Necesario para que Web Speech pueda usar el mic sin contención.
	 */
	const releaseAudio = useCallback(() => {
		stopAudioMeter();
		streamRef.current?.getAudioTracks().forEach((t) => {
			t.stop();
			streamRef.current?.removeTrack(t);
		});
		setVersion((v) => v + 1);
		setAudioLevel(0);
	}, [stopAudioMeter]);

	useEffect(() => {
		void refreshDevices();
		const mediaDevices = navigator.mediaDevices;
		if (!mediaDevices?.addEventListener) return;
		mediaDevices.addEventListener("devicechange", refreshDevices);
		return () => mediaDevices.removeEventListener("devicechange", refreshDevices);
	}, [refreshDevices]);

	useEffect(() => () => stop(), [stop]);

	return {
		status,
		audioLevel,
		version,
		devices,
		selectedAudioId,
		selectedVideoId,
		stream: streamRef,
		start,
		stop,
		ensureActive,
		releaseAudio,
		refreshDevices,
		selectAudioDevice,
		selectVideoDevice,
	};
}

export type MediaController = ReturnType<typeof useMediaStream>;
