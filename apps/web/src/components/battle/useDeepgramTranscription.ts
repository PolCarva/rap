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
	const ownsStreamRef = useRef(false);
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const nodeRef = useRef<AudioWorkletNode | null>(null);
	const finalRef = useRef("");
	const interimRef = useRef("");
	const onUpdateRef = useRef<((full: string) => void) | null>(null);
	/** true mientras el cierre del WS es intencional (stop/cleanup). */
	const closingRef = useRef(false);
	const sessionRef = useRef(0);

	const cleanup = useCallback(() => {
		closingRef.current = true;
		nodeRef.current?.port.close();
		nodeRef.current?.disconnect();
		nodeRef.current = null;
		sourceRef.current?.disconnect();
		sourceRef.current = null;
		try {
			wsRef.current?.close();
		} catch {
			/* noop */
		}
		wsRef.current = null;
		ctxRef.current?.close().catch(() => {});
		ctxRef.current = null;
		if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
		ownsStreamRef.current = false;
		streamRef.current = null;
	}, []);

	const start = useCallback(
		async (onUpdate?: (full: string) => void, keywords?: string[], sourceStream?: MediaStream | null) => {
			if (!supported || !secure) {
				setError(!secure ? "insecure" : "unsupported");
				return;
			}
			cleanup();
			const session = ++sessionRef.current;
			onUpdateRef.current = onUpdate ?? null;
			finalRef.current = "";
			interimRef.current = "";
			setTranscript("");
			setInterim("");
			setError(null);

			let stream: MediaStream;
			const liveAudioTracks = sourceStream?.getAudioTracks().filter((track) => track.readyState === "live") ?? [];
			if (liveAudioTracks.length > 0) {
				stream = new MediaStream(liveAudioTracks);
				ownsStreamRef.current = false;
			} else {
				try {
					stream = await navigator.mediaDevices.getUserMedia({
						audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
					});
					ownsStreamRef.current = true;
				} catch {
					setError("not-allowed");
					return;
				}
			}
			streamRef.current = stream;

			// Contexto de audio a 16kHz (lo que pide Deepgram); guardamos el real.
			const ctx = new AudioContext({ sampleRate: 16000 });
			ctxRef.current = ctx;
			await ctx.resume().catch(() => {});

			closingRef.current = false;
			const ws = new WebSocket(transcribeUrl());
			ws.binaryType = "arraybuffer";
			wsRef.current = ws;

			ws.addEventListener("error", () => {
				if (sessionRef.current === session) setError("connection");
			});
			ws.addEventListener("close", () => {
				// Cierre inesperado en plena escucha: avisar para activar el respaldo.
				if (!closingRef.current && wsRef.current === ws && sessionRef.current === session) {
					setError("connection");
					setListening(false);
				}
			});
			ws.addEventListener("message", (ev) => {
				if (sessionRef.current !== session) return;
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
					interimRef.current = "";
					setTranscript(finalRef.current);
					setInterim("");
					onUpdateRef.current?.(finalRef.current);
				} else {
					interimRef.current = text;
					setInterim(text);
					onUpdateRef.current?.(`${finalRef.current} ${text}`.trim());
				}
			});

			const opened = await new Promise<boolean>((resolve) => {
				if (ws.readyState === WebSocket.OPEN) {
					resolve(true);
					return;
				}
				const done = (ok: boolean) => {
					window.clearTimeout(timer);
					resolve(ok);
				};
				const timer = window.setTimeout(() => done(false), 4500);
				ws.addEventListener("open", () => done(true), { once: true });
				ws.addEventListener("error", () => done(false), { once: true });
				ws.addEventListener("close", () => done(false), { once: true });
			});
			if (!opened || wsRef.current !== ws || sessionRef.current !== session) {
				if (sessionRef.current === session) setError("connection");
				cleanup();
				return;
			}

			// Config con el sample rate real (por si el browser no respetó 16k) y
			// las palabras de la batalla para boost de transcripción.
			ws.send(JSON.stringify({ type: "config", sampleRate: ctx.sampleRate, keywords: keywords ?? [] }));

			// Pipeline de audio: mic -> worklet PCM16 -> WS.
			await ctx.audioWorklet.addModule("/pcm-worklet.js");
			const source = ctx.createMediaStreamSource(stream);
			const node = new AudioWorkletNode(ctx, "pcm-processor");
			sourceRef.current = source;
			nodeRef.current = node;
			node.port.onmessage = (e) => {
				if (sessionRef.current === session && ws.readyState === WebSocket.OPEN) ws.send(e.data as ArrayBuffer);
			};
			source.connect(node);
			node.connect(ctx.destination); // pull silencioso (el worklet no escribe salida)

			if (sessionRef.current === session) setListening(true);
		},
		[supported, secure, cleanup],
	);

	/** Detiene la captura y devuelve la transcripción acumulada. */
	const stop = useCallback(async (): Promise<string> => {
		setListening(false);
		closingRef.current = true;
		nodeRef.current?.port.close();
		nodeRef.current?.disconnect();
		nodeRef.current = null;
		sourceRef.current?.disconnect();
		sourceRef.current = null;
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			try {
				wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
				await new Promise((resolve) => window.setTimeout(resolve, 450));
			} catch {
				/* cerrar igual abajo */
			}
		}
		const full = `${finalRef.current} ${interimRef.current}`.trim();
		cleanup();
		return full;
	}, [cleanup]);

	return { supported, secure, listening, error, transcript, interim, start, stop };
}
