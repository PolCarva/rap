"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// --- Tipos mínimos de la Web Speech API (no están en lib.dom estándar) ---
interface SpeechAlternative {
	transcript: string;
}
interface SpeechResult {
	readonly isFinal: boolean;
	readonly length: number;
	[index: number]: SpeechAlternative;
}
interface SpeechResultList {
	readonly length: number;
	[index: number]: SpeechResult;
}
interface SpeechResultEvent {
	readonly resultIndex: number;
	readonly results: SpeechResultList;
}
interface SpeechRecognitionLike {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((e: SpeechResultEvent) => void) | null;
	onend: (() => void) | null;
	onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechCtor | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as {
		SpeechRecognition?: SpeechCtor;
		webkitSpeechRecognition?: SpeechCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Reconocimiento de voz en tiempo real (Web Speech API). Devuelve la
 * transcripción final acumulada y el texto interino (parcial) en vivo, ideal
 * para subtítulos. Se reinicia solo si el navegador corta la sesión mientras
 * queremos seguir escuchando.
 */
export function useSpeechRecognition(lang = "es-AR") {
	const [supported] = useState(() => getCtor() !== null);
	const [secure] = useState(() => (typeof window === "undefined" ? true : window.isSecureContext));
	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [transcript, setTranscript] = useState(""); // finales acumulados
	const [interim, setInterim] = useState(""); // parcial en vivo

	const recRef = useRef<SpeechRecognitionLike | null>(null);
	const wantRef = useRef(false);
	const finalRef = useRef("");
	const onUpdateRef = useRef<((full: string) => void) | null>(null);

	const start = useCallback(
		(onUpdate?: (full: string) => void) => {
			const Ctor = getCtor();
			if (!Ctor) return;
			// Cerrar cualquier instancia previa antes de abrir una nueva.
			recRef.current?.abort();
			onUpdateRef.current = onUpdate ?? null;
			finalRef.current = "";
			setTranscript("");
			setInterim("");
			setError(null);

			const rec = new Ctor();
			rec.lang = lang;
			rec.continuous = true;
			rec.interimResults = true;

			rec.onresult = (e) => {
				let partial = "";
				for (let i = e.resultIndex; i < e.results.length; i++) {
					const res = e.results[i]!;
					const text = res[0]!.transcript;
					if (res.isFinal) {
						finalRef.current = `${finalRef.current} ${text}`.trim();
					} else {
						partial += text;
					}
				}
				setError(null);
				setTranscript(finalRef.current);
				setInterim(partial);
				const full = `${finalRef.current} ${partial}`.trim();
				onUpdateRef.current?.(full);
			};

			rec.onend = () => {
				// El navegador corta por silencio; reiniciar si seguimos en el turno.
				if (wantRef.current) {
					try {
						rec.start();
					} catch {
						/* ya arrancando */
					}
				} else {
					setListening(false);
				}
			};

			rec.onerror = (ev) => {
				// no-speech/aborted son transitorios: onend reinicia.
				if (ev.error === "no-speech" || ev.error === "aborted") return;
				setError(ev.error);
				if (
					ev.error === "not-allowed" ||
					ev.error === "service-not-allowed" ||
					ev.error === "audio-capture"
				) {
					wantRef.current = false;
					setListening(false);
				}
			};

			recRef.current = rec;
			wantRef.current = true;
			try {
				rec.start();
				setListening(true);
			} catch {
				/* ya iniciado */
			}
		},
		[lang],
	);

	/** Detiene y devuelve la transcripción final acumulada. */
	const stop = useCallback((): string => {
		wantRef.current = false;
		recRef.current?.stop();
		setListening(false);
		const full = `${finalRef.current} ${interim}`.trim();
		return full;
	}, [interim]);

	useEffect(
		() => () => {
			wantRef.current = false;
			recRef.current?.abort();
		},
		[],
	);

	return { supported, secure, listening, error, transcript, interim, start, stop };
}
