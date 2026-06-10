"use client";

import { transcribeUrl } from "@/lib/realtime";
import { useCallback, useRef, useState } from "react";

interface DeepgramAlternative {
	transcript?: string;
}
interface DeepgramMessage {
	type?: string;
	message?: string;
	is_final?: boolean;
	channel?: { alternatives?: DeepgramAlternative[] };
}

/**
 * Transcripción en vivo palabra-por-palabra vía Deepgram (streaming).
 * Captura el mic, lo pasa a PCM16 con un AudioWorklet y lo manda por WebSocket
 * a nuestro Worker, que lo reenvía a Deepgram. Expone `transcript` (finales
 * acumulados) e `interim` (parcial en vivo, se actualiza varias veces/seg).
 * Cross-browser: anda en Brave, Firefox, Chrome y Safari.
 */
export function useDeepgramTranscription() {
	const [supported] = useState(
		() =>
		typeof window !== "undefined" &&
			typeof AudioWorkletNode !== "undefined" &&
			!!navigator.mediaDevices?.getUserMedia,
	);
	const [secure] = useState(() => (typeof window === "undefined" ? true : window.isSecureContext));

	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [transcript, setTranscript] = useState(""); // finales acumulados
	const [interim, setInterim] = useState(""); // parcial en vivo

	const wsRef = useRef<WebSocket | null>(null);
	const ctxRef = useRef<AudioContext | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const finalRef = useRef("");
	const onUpdateRef = useRef<((full: string) => void) | null>(null);

	const cleanup = useCallback(() => {
		try {
			wsRef.current?.close();
		} catch {
			/* noop */
		}
		wsRef.current = null;
		ctxRef.current?.close().catch(() => {});
		ctxRef.current = null;
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
	}, []);

	const start = useCallback(
		async (onUpdate?: (full: string) => void) => {
			if (!supported || !secure) {
				setError(!secure ? "insecure" : "unsupported");
				return;
			}
			onUpdateRef.current = onUpdate ?? null;
			finalRef.current = "";
			setTranscript("");
			setInterim("");
			setError(null);

			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
				});
			} catch {
				setError("not-allowed");
				return;
			}
			streamRef.current = stream;

			// Contexto de audio a 16kHz (lo que pide Deepgram); guardamos el real.
			const ctx = new AudioContext({ sampleRate: 16000 });
			ctxRef.current = ctx;
			await ctx.resume().catch(() => {});

			const ws = new WebSocket(transcribeUrl());
			ws.binaryType = "arraybuffer";
			wsRef.current = ws;

			ws.addEventListener("error", () => setError("connection"));
			ws.addEventListener("message", (ev) => {
				let msg: DeepgramMessage;
				try {
					msg = JSON.parse(ev.data as string);
				} catch {
					return;
				}
				if (msg.type === "Error") {
					setError(msg.message ?? "error");
					return;
				}
				if (msg.type !== "Results") return;
				const text = (msg.channel?.alternatives?.[0]?.transcript ?? "").trim();
				if (!text) return;
				if (msg.is_final) {
					finalRef.current = `${finalRef.current} ${text}`.trim();
					setTranscript(finalRef.current);
					setInterim("");
					onUpdateRef.current?.(finalRef.current);
				} else {
					setInterim(text);
					onUpdateRef.current?.(`${finalRef.current} ${text}`.trim());
				}
			});

			await new Promise<void>((resolve) => {
				if (ws.readyState === WebSocket.OPEN) return resolve();
				ws.addEventListener("open", () => resolve(), { once: true });
			});

			// Config con el sample rate real (por si el browser no respetó 16k).
			ws.send(JSON.stringify({ type: "config", sampleRate: ctx.sampleRate }));

			// Pipeline de audio: mic -> worklet PCM16 -> WS.
			await ctx.audioWorklet.addModule("/pcm-worklet.js");
			const source = ctx.createMediaStreamSource(stream);
			const node = new AudioWorkletNode(ctx, "pcm-processor");
			node.port.onmessage = (e) => {
				if (ws.readyState === WebSocket.OPEN) ws.send(e.data as ArrayBuffer);
			};
			source.connect(node);
			node.connect(ctx.destination); // pull silencioso (el worklet no escribe salida)

			setListening(true);
		},
		[supported, secure],
	);

	/** Detiene la captura y devuelve la transcripción acumulada. */
	const stop = useCallback((): string => {
		setListening(false);
		const full = `${finalRef.current} ${interim}`.trim();
		cleanup();
		return full;
	}, [interim, cleanup]);

	return { supported, secure, listening, error, transcript, interim, start, stop };
}
