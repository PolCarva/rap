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
	const activeRef = useRef(false);
	const partsRef = useRef<string[]>([]);
	const seqRef = useRef(0);
	const onUpdateRef = useRef<((full: string) => void) | null>(null);

	const transcribeChunk = useCallback(async (blob: Blob, format: string, index: number) => {
		try {
			const data = await blobToBase64(blob);
			const res = await fetch("/api/transcribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data, format }),
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { error?: string } | null;
				setError(err?.error ?? `HTTP ${res.status}`);
				return;
			}
			const json = (await res.json()) as { text?: string };
			const text = (json.text ?? "").trim();
			if (text) {
				partsRef.current[index] = text;
				const full = partsRef.current.filter(Boolean).join(" ").trim();
				setTranscript(full);
				onUpdateRef.current?.(full);
				setError(null);
			}
		} catch {
			setError("No se pudo transcribir el audio");
		}
	}, []);

	const start = useCallback(
		async (onUpdate?: (full: string) => void, _keywords?: string[]) => {
			if (!supported || !secure) return;
			onUpdateRef.current = onUpdate ?? null;
			partsRef.current = [];
			seqRef.current = 0;
			setTranscript("");
			setError(null);

			try {
				streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
			} catch {
				setError("not-allowed");
				return;
			}

			activeRef.current = true;
			setListening(true);
			const mime = pickMime();
			const format = formatFromMime(mime);

			const cycle = () => {
				if (!activeRef.current || !streamRef.current) return;
				const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
				const chunks: Blob[] = [];
				const index = seqRef.current++;
				rec.ondataavailable = (e) => {
					if (e.data.size > 0) chunks.push(e.data);
				};
				rec.onstop = () => {
					const blob = new Blob(chunks, { type: mime || "audio/webm" });
					if (blob.size > 1200) void transcribeChunk(blob, format, index); // saltar casi-vacíos
					if (activeRef.current) cycle(); // arrancar el siguiente sin esperar la transcripción
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
	const stop = useCallback((): string => {
		activeRef.current = false;
		setListening(false);
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		return partsRef.current.filter(Boolean).join(" ").trim();
	}, []);

	return { supported, secure, listening, error, transcript, start, stop };
}
