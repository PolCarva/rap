"use client";

import { useCallback, useRef, useState } from "react";

/** Duración de cada fragmento de audio que se transcribe. */
const CHUNK_MS = 3000;

function pickMime(): string {
	if (typeof MediaRecorder === "undefined") return "";
	const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
	for (const c of candidates) {
		if (MediaRecorder.isTypeSupported(c)) return c;
	}
	return "";
}

function formatFromMime(mime: string): string {
	if (mime.includes("webm")) return "webm";
	if (mime.includes("ogg")) return "ogg";
	if (mime.includes("mp4")) return "m4a";
	return "webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	const step = 0x8000;
	for (let i = 0; i < bytes.length; i += step) {
		binary += String.fromCharCode(...bytes.subarray(i, i + step));
	}
	return btoa(binary);
}

/**
 * Transcripción genérica y cross-browser: captura el micrófono con
 * MediaRecorder, corta fragmentos de ~3s y los manda a /api/transcribe
 * (que llama a OpenRouter). Acumula el texto en orden. Funciona en Brave,
 * Firefox, Chrome y Safari. No es palabra-por-palabra: aparece cada ~3s.
 */
export function useChunkedTranscription() {
	const [supported] = useState(
		() =>
		typeof MediaRecorder !== "undefined" &&
			typeof navigator !== "undefined" &&
			!!navigator.mediaDevices?.getUserMedia,
	);
	const [secure] = useState(() => (typeof window === "undefined" ? true : window.isSecureContext));

	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [transcript, setTranscript] = useState("");

	const streamRef = useRef<MediaStream | null>(null);
	const ownsStreamRef = useRef(false);
	const activeRef = useRef(false);
	const partsRef = useRef<string[]>([]);
	const seqRef = useRef(0);
	const onUpdateRef = useRef<((full: string) => void) | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const pendingRef = useRef<Set<Promise<void>>>(new Set());
	const currentStopRef = useRef<Promise<void> | null>(null);
	const sessionRef = useRef(0);

	const transcribeChunk = useCallback(async (blob: Blob, format: string, index: number, session: number) => {
		try {
			const data = await blobToBase64(blob);
			const res = await fetch("/api/transcribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data, format }),
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { error?: string } | null;
				if (sessionRef.current === session) setError(err?.error ?? `HTTP ${res.status}`);
				return;
			}
			const json = (await res.json()) as { text?: string };
			const text = (json.text ?? "").trim();
			if (text && sessionRef.current === session) {
				partsRef.current[index] = text;
				const full = partsRef.current.filter(Boolean).join(" ").trim();
				setTranscript(full);
				onUpdateRef.current?.(full);
				setError(null);
			}
		} catch {
			if (sessionRef.current === session) setError("No se pudo transcribir el audio");
		}
	}, []);

	const start = useCallback(
		async (onUpdate?: (full: string) => void, _keywords?: string[], sourceStream?: MediaStream | null) => {
			void _keywords;
			if (!supported || !secure) return;
			activeRef.current = false;
			if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
			if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
			const session = ++sessionRef.current;
			onUpdateRef.current = onUpdate ?? null;
			partsRef.current = [];
			seqRef.current = 0;
			pendingRef.current.clear();
			currentStopRef.current = null;
			setTranscript("");
			setError(null);

			const liveAudioTracks = sourceStream?.getAudioTracks().filter((track) => track.readyState === "live") ?? [];
			if (liveAudioTracks.length > 0) {
				streamRef.current = new MediaStream(liveAudioTracks);
				ownsStreamRef.current = false;
			} else {
				try {
					streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
					ownsStreamRef.current = true;
				} catch {
					setError("not-allowed");
					return;
				}
			}

			activeRef.current = true;
			setListening(true);
			const mime = pickMime();
			const format = formatFromMime(mime);

			const cycle = () => {
				if (!activeRef.current || !streamRef.current || sessionRef.current !== session) return;
				const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
				recorderRef.current = rec;
				const chunks: Blob[] = [];
				const index = seqRef.current++;
				rec.ondataavailable = (e) => {
					if (e.data.size > 0) chunks.push(e.data);
				};
				rec.onstop = () => {
					if (recorderRef.current === rec) recorderRef.current = null;
					if (sessionRef.current !== session) return;
					const blob = new Blob(chunks, { type: mime || "audio/webm" });
					const job = blob.size > 1200 ? transcribeChunk(blob, format, index, session) : Promise.resolve(); // saltar casi-vacíos
					pendingRef.current.add(job);
					currentStopRef.current = job.finally(() => {
						pendingRef.current.delete(job);
						if (activeRef.current && sessionRef.current === session) cycle(); // arrancar el siguiente sin esperar la transcripción
					});
				};
				rec.start();
				setTimeout(() => {
					if (rec.state !== "inactive") rec.stop();
				}, CHUNK_MS);
			};
			cycle();
		},
		[supported, secure, transcribeChunk],
	);

	/** Detiene la captura y devuelve la transcripción acumulada. */
	const stop = useCallback(async (): Promise<string> => {
		activeRef.current = false;
		setListening(false);
		const rec = recorderRef.current;
		if (rec && rec.state !== "inactive") {
			await new Promise<void>((resolve) => {
				const previous = rec.onstop;
				rec.onstop = (ev) => {
					previous?.call(rec, ev);
					resolve();
				};
				rec.stop();
			});
		}
		if (currentStopRef.current) await currentStopRef.current.catch(() => {});
		await Promise.race([
			Promise.all([...pendingRef.current]).catch(() => undefined),
			new Promise((resolve) => window.setTimeout(resolve, 5000)),
		]);
		if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
		ownsStreamRef.current = false;
		streamRef.current = null;
		return partsRef.current.filter(Boolean).join(" ").trim();
	}, []);

	return { supported, secure, listening, error, transcript, start, stop };
}
