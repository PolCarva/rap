"use client";

import { synthStyleOf, type Beat, type SynthStyle } from "@rap/shared";
import { isSoundCloudUrl } from "@/lib/bpm";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reproductor de beats. Soporta dos fuentes:
 * - `synth:<estilo>`: batería + bajo sintetizados con WebAudio al BPM del beat.
 *   Cero assets, loop perfecto y BPM exacto.
 * - URL http(s): un <audio> en loop (beats subidos por el backoffice).
 * - SoundCloud: widget oficial embebido y controlado por postMessage.
 *
 * `blocked` queda true si el navegador bloqueó el autoplay; `unlock()` debe
 * llamarse desde un gesto del usuario.
 */

const SOUNDCLOUD_WIDGET_API = "https://w.soundcloud.com/player/api.js";

interface SoundCloudWidget {
	bind(eventName: string, listener: () => void): void;
	unbind(eventName: string): void;
	play(): void;
	pause(): void;
	seekTo(milliseconds: number): void;
	setVolume(volume: number): void;
	isPaused(callback: (paused: boolean) => void): void;
}

interface SoundCloudApi {
	Widget: {
		(iframe: HTMLIFrameElement | string): SoundCloudWidget;
		Events: {
			FINISH: string;
			PAUSE: string;
			PLAY: string;
			READY: string;
		};
	};
}

declare global {
	interface Window {
		SC?: SoundCloudApi;
	}
}

let soundCloudApiPromise: Promise<SoundCloudApi> | null = null;
let soundCloudConnectionPrimed = false;

function primeSoundCloudConnection(): void {
	if (soundCloudConnectionPrimed || typeof document === "undefined") return;
	soundCloudConnectionPrimed = true;
	for (const href of ["https://w.soundcloud.com", "https://api-widget.soundcloud.com"]) {
		const existing = document.querySelector<HTMLLinkElement>(`link[rel="preconnect"][href="${href}"]`);
		if (existing) continue;
		const link = document.createElement("link");
		link.rel = "preconnect";
		link.href = href;
		link.crossOrigin = "anonymous";
		document.head.appendChild(link);
	}
	void loadSoundCloudApi().catch(() => {});
}

function loadSoundCloudApi(): Promise<SoundCloudApi> {
	if (window.SC?.Widget) return Promise.resolve(window.SC);
	if (soundCloudApiPromise) return soundCloudApiPromise;

	soundCloudApiPromise = new Promise((resolve, reject) => {
		const done = () => {
			if (window.SC?.Widget) resolve(window.SC);
			else reject(new Error("SoundCloud Widget API no disponible"));
		};
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${SOUNDCLOUD_WIDGET_API}"]`);
		if (existing) {
			existing.addEventListener("load", done, { once: true });
			existing.addEventListener("error", () => reject(new Error("No se pudo cargar SoundCloud")), { once: true });
			return;
		}

		const script = document.createElement("script");
		script.src = SOUNDCLOUD_WIDGET_API;
		script.async = true;
		script.addEventListener("load", done, { once: true });
		script.addEventListener("error", () => reject(new Error("No se pudo cargar SoundCloud")), { once: true });
		document.head.appendChild(script);
	});

	return soundCloudApiPromise;
}

function soundCloudParams(audioUrl: string, autoPlay: boolean): URLSearchParams {
	return new URLSearchParams({
		url: audioUrl,
		auto_play: autoPlay ? "true" : "false",
		buying: "false",
		download: "false",
		hide_related: "true",
		sharing: "false",
		show_artwork: "false",
		show_comments: "false",
		show_playcount: "false",
		show_reposts: "false",
		show_teaser: "false",
		show_user: "false",
		single_active: "false",
		visual: "false",
	});
}

function createSoundCloudFrame(audioUrl: string, autoPlay: boolean): HTMLIFrameElement {
	const iframe = document.createElement("iframe");
	iframe.title = "SoundCloud beat player";
	iframe.allow = "autoplay";
	iframe.src = `https://w.soundcloud.com/player/?${soundCloudParams(audioUrl, autoPlay).toString()}`;
	iframe.setAttribute("scrolling", "no");
	iframe.setAttribute("frameborder", "no");
	Object.assign(iframe.style, {
		border: "0",
		bottom: "0",
		height: "1px",
		left: "0",
		opacity: "0",
		pointerEvents: "none",
		position: "fixed",
		width: "1px",
	});
	document.body.appendChild(iframe);
	return iframe;
}

interface PatternStep {
	/** Paso dentro del compás de 16 (0..15). */
	step: number;
	kind: "kick" | "snare" | "hat" | "openhat" | "bass";
	/** Para bass: frecuencia en Hz. */
	freq?: number;
	/** Duración relativa (solo bass), en pasos de 16vo. */
	len?: number;
	/** Ganancia relativa del golpe. */
	gain?: number;
}

/** Progresión de bajo (Hz) por compás; cicla. */
const BASS_PROG = [55.0, 55.0, 65.41, 49.0]; // A1 A1 C2 G1

function buildPattern(style: SynthStyle): { steps: PatternStep[]; bars: number; swing: number } {
	switch (style) {
		case "boombap":
			return {
				bars: 1,
				swing: 0.18,
				steps: [
					{ step: 0, kind: "kick" },
					{ step: 7, kind: "kick", gain: 0.8 },
					{ step: 10, kind: "kick", gain: 0.9 },
					{ step: 4, kind: "snare" },
					{ step: 12, kind: "snare" },
					...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, kind: "hat" as const, gain: step % 4 === 0 ? 0.8 : 0.5 })),
					{ step: 14, kind: "openhat", gain: 0.45 },
					{ step: 0, kind: "bass", len: 3 },
					{ step: 10, kind: "bass", len: 2, gain: 0.8 },
				],
			};
		case "trap":
			return {
				bars: 2,
				swing: 0,
				steps: [
					// compás 1
					{ step: 0, kind: "kick" },
					{ step: 6, kind: "kick", gain: 0.85 },
					{ step: 8, kind: "snare" },
					// compás 2
					{ step: 16, kind: "kick" },
					{ step: 19, kind: "kick", gain: 0.85 },
					{ step: 24, kind: "snare" },
					// hats rodantes
					...Array.from({ length: 32 }, (_, i) => ({ step: i, kind: "hat" as const, gain: i % 8 === 0 ? 0.75 : i % 2 === 0 ? 0.5 : 0.32 })),
					{ step: 14, kind: "openhat", gain: 0.4 },
					{ step: 30, kind: "openhat", gain: 0.4 },
					// 808 largos
					{ step: 0, kind: "bass", len: 6, gain: 1.1 },
					{ step: 8, kind: "bass", len: 4, gain: 0.9 },
					{ step: 16, kind: "bass", len: 6, gain: 1.1 },
					{ step: 24, kind: "bass", len: 5, gain: 0.9 },
				],
			};
		case "dembow":
			return {
				bars: 1,
				swing: 0,
				steps: [
					{ step: 0, kind: "kick" },
					{ step: 4, kind: "kick" },
					{ step: 8, kind: "kick" },
					{ step: 12, kind: "kick" },
					{ step: 3, kind: "snare", gain: 0.9 },
					{ step: 6, kind: "snare", gain: 0.75 },
					{ step: 11, kind: "snare", gain: 0.9 },
					{ step: 14, kind: "snare", gain: 0.75 },
					...[2, 6, 10, 14].map((step) => ({ step, kind: "hat" as const, gain: 0.45 })),
					{ step: 0, kind: "bass", len: 2 },
					{ step: 8, kind: "bass", len: 2, gain: 0.85 },
				],
			};
		case "doblet":
		default:
			return {
				bars: 1,
				swing: 0.1,
				steps: [
					{ step: 0, kind: "kick" },
					{ step: 5, kind: "kick", gain: 0.8 },
					{ step: 8, kind: "kick", gain: 0.95 },
					{ step: 13, kind: "kick", gain: 0.8 },
					{ step: 4, kind: "snare" },
					{ step: 12, kind: "snare" },
					...Array.from({ length: 16 }, (_, i) => ({ step: i, kind: "hat" as const, gain: i % 2 === 0 ? 0.55 : 0.35 })),
					{ step: 0, kind: "bass", len: 4 },
					{ step: 8, kind: "bass", len: 4, gain: 0.85 },
				],
			};
	}
}

class SynthEngine {
	private ctx: AudioContext;
	private master: GainNode;
	private noise: AudioBuffer;
	private timer: ReturnType<typeof setInterval> | null = null;
	private nextBarTime = 0;
	private barIndex = 0;

	constructor(private bpm: number, private style: SynthStyle, volume: number) {
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		this.ctx = new Ctor();
		this.master = this.ctx.createGain();
		this.master.gain.value = volume;
		// Compresor suave para pegar el conjunto.
		const comp = this.ctx.createDynamicsCompressor();
		comp.threshold.value = -14;
		comp.ratio.value = 4;
		this.master.connect(comp);
		comp.connect(this.ctx.destination);
		// Buffer de ruido blanco compartido (snare/hats).
		const len = this.ctx.sampleRate;
		this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	}

	get blocked(): boolean {
		return this.ctx.state === "suspended";
	}

	async resume(): Promise<void> {
		await this.ctx.resume().catch(() => {});
	}

	start(): void {
		if (this.timer) return;
		this.nextBarTime = this.ctx.currentTime + 0.05;
		this.barIndex = 0;
		const pattern = buildPattern(this.style);
		const stepDur = 60 / this.bpm / 4; // 16vos
		const patternDur = stepDur * 16 * pattern.bars;
		const schedule = () => {
			// Agendar todos los compases que entren en la ventana de 300ms.
			while (this.nextBarTime < this.ctx.currentTime + 0.3) {
				this.scheduleBar(pattern, this.nextBarTime, stepDur);
				this.nextBarTime += patternDur;
				this.barIndex += pattern.bars;
			}
		};
		schedule();
		this.timer = setInterval(schedule, 120);
	}

	private scheduleBar(pattern: { steps: PatternStep[]; swing: number }, barStart: number, stepDur: number): void {
		const bassRoot = BASS_PROG[this.barIndex % BASS_PROG.length]!;
		for (const s of pattern.steps) {
			const swingDelay = s.step % 2 === 1 ? pattern.swing * stepDur : 0;
			const t = barStart + s.step * stepDur + swingDelay;
			const g = s.gain ?? 1;
			switch (s.kind) {
				case "kick":
					this.kick(t, g);
					break;
				case "snare":
					this.snare(t, g);
					break;
				case "hat":
					this.hat(t, g, false);
					break;
				case "openhat":
					this.hat(t, g, true);
					break;
				case "bass":
					this.bass(t, s.freq ?? bassRoot, (s.len ?? 2) * stepDur, g);
					break;
			}
		}
	}

	private kick(t: number, g: number): void {
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(150, t);
		osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
		gain.gain.setValueAtTime(1.05 * g, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
		osc.connect(gain);
		gain.connect(this.master);
		osc.start(t);
		osc.stop(t + 0.32);
	}

	private snare(t: number, g: number): void {
		const noise = this.ctx.createBufferSource();
		noise.buffer = this.noise;
		const band = this.ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.value = 1800;
		band.Q.value = 0.8;
		const ngain = this.ctx.createGain();
		ngain.gain.setValueAtTime(0.55 * g, t);
		ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
		noise.connect(band);
		band.connect(ngain);
		ngain.connect(this.master);
		noise.start(t, Math.random() * 0.4, 0.25);

		const tone = this.ctx.createOscillator();
		tone.type = "triangle";
		tone.frequency.value = 190;
		const tgain = this.ctx.createGain();
		tgain.gain.setValueAtTime(0.32 * g, t);
		tgain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
		tone.connect(tgain);
		tgain.connect(this.master);
		tone.start(t);
		tone.stop(t + 0.1);
	}

	private hat(t: number, g: number, open: boolean): void {
		const noise = this.ctx.createBufferSource();
		noise.buffer = this.noise;
		const hp = this.ctx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = 7200;
		const gain = this.ctx.createGain();
		const dur = open ? 0.22 : 0.045;
		gain.gain.setValueAtTime(0.32 * g, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
		noise.connect(hp);
		hp.connect(gain);
		gain.connect(this.master);
		noise.start(t, Math.random() * 0.4, dur + 0.02);
	}

	private bass(t: number, freq: number, dur: number, g: number): void {
		const osc = this.ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(freq * 1.5, t);
		osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
		const gain = this.ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(0.5 * g, t + 0.02);
		gain.gain.setValueAtTime(0.5 * g, t + Math.max(0.02, dur - 0.08));
		gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
		osc.connect(gain);
		gain.connect(this.master);
		osc.start(t);
		osc.stop(t + dur + 0.05);
	}

	setVolume(v: number): void {
		this.master.gain.value = v;
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.ctx.close().catch(() => {});
	}
}

export function useBeatPlayer() {
	const [playing, setPlaying] = useState<string | null>(null);
	const [blocked, setBlocked] = useState(false);
	const engineRef = useRef<SynthEngine | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const soundCloudWidgetRef = useRef<SoundCloudWidget | null>(null);
	const soundCloudFrameRef = useRef<HTMLIFrameElement | null>(null);
	const soundCloudBlockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const playSeqRef = useRef(0);
	const beatRef = useRef<Beat | null>(null);

	const stop = useCallback(() => {
		playSeqRef.current += 1;
		if (soundCloudBlockedTimerRef.current) clearTimeout(soundCloudBlockedTimerRef.current);
		soundCloudBlockedTimerRef.current = null;
		engineRef.current?.stop();
		engineRef.current = null;
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.src = "";
			audioRef.current = null;
		}
		if (soundCloudWidgetRef.current) {
			try {
				const events = window.SC?.Widget.Events;
				if (events) {
					soundCloudWidgetRef.current.unbind(events.READY);
					soundCloudWidgetRef.current.unbind(events.PLAY);
					soundCloudWidgetRef.current.unbind(events.PAUSE);
					soundCloudWidgetRef.current.unbind(events.FINISH);
				}
				soundCloudWidgetRef.current.pause();
			} catch {
				/* el iframe pudo haberse desmontado primero */
			}
			soundCloudWidgetRef.current = null;
		}
		soundCloudFrameRef.current?.remove();
		soundCloudFrameRef.current = null;
		beatRef.current = null;
		setPlaying(null);
		setBlocked(false);
	}, []);

	const play = useCallback(
		async (beat: Beat, volume = 0.4) => {
			if (beatRef.current?.id === beat.id && !blocked) return;
			stop();
			const seq = ++playSeqRef.current;
			beatRef.current = beat;
			const style = synthStyleOf(beat);
			if (style) {
				const engine = new SynthEngine(beat.bpm ?? 90, style, volume);
				engineRef.current = engine;
				await engine.resume();
				if (engine.blocked) {
					setBlocked(true);
				} else {
					engine.start();
					setBlocked(false);
				}
				setPlaying(beat.id);
				return;
			}
			if (isSoundCloudUrl(beat.audioUrl)) {
				setPlaying(beat.id);
				const frame = createSoundCloudFrame(beat.audioUrl, true);
				soundCloudFrameRef.current = frame;
				try {
					const api = await loadSoundCloudApi();
					if (playSeqRef.current !== seq) return;
					const widget = api.Widget(frame);
					soundCloudWidgetRef.current = widget;

					const checkBlocked = (delay = 1200) => {
						if (soundCloudBlockedTimerRef.current) clearTimeout(soundCloudBlockedTimerRef.current);
						soundCloudBlockedTimerRef.current = setTimeout(() => {
							if (playSeqRef.current !== seq) return;
							widget.isPaused((paused) => {
								if (playSeqRef.current !== seq) return;
								setBlocked(paused);
							});
						}, delay);
					};

					widget.bind(api.Widget.Events.READY, () => {
						if (playSeqRef.current !== seq) return;
						widget.setVolume(Math.round(volume * 100));
						widget.seekTo(0);
						widget.play();
						checkBlocked();
					});
					widget.bind(api.Widget.Events.PLAY, () => {
						if (playSeqRef.current === seq) setBlocked(false);
					});
					widget.bind(api.Widget.Events.FINISH, () => {
						if (playSeqRef.current !== seq) return;
						widget.seekTo(0);
						widget.play();
					});
					checkBlocked(5000);
				} catch {
					if (playSeqRef.current === seq) setBlocked(true);
				}
				return;
			}
			const audio = new Audio(beat.audioUrl);
			audio.loop = true;
			audio.volume = volume;
			audio.crossOrigin = "anonymous";
			audioRef.current = audio;
			setPlaying(beat.id);
			audio.play().then(
				() => setBlocked(false),
				() => setBlocked(true),
			);
		},
		[blocked, stop],
	);

	/** Reintenta arrancar tras un gesto del usuario (autoplay bloqueado). */
	const unlock = useCallback(async () => {
		const beat = beatRef.current;
		const engine = engineRef.current;
		if (engine) {
			await engine.resume();
			if (!engine.blocked) {
				engine.start();
				setBlocked(false);
			}
			return;
		}
		if (audioRef.current) {
			audioRef.current.play().then(
				() => setBlocked(false),
				() => setBlocked(true),
			);
			return;
		}
		if (soundCloudWidgetRef.current) {
			const seq = playSeqRef.current;
			soundCloudWidgetRef.current.play();
			if (soundCloudBlockedTimerRef.current) clearTimeout(soundCloudBlockedTimerRef.current);
			soundCloudBlockedTimerRef.current = setTimeout(() => {
				soundCloudWidgetRef.current?.isPaused((paused) => {
					if (playSeqRef.current === seq) setBlocked(paused);
				});
			}, 700);
			return;
		}
		if (beat) void play(beat);
	}, [play]);

	useEffect(() => {
		primeSoundCloudConnection();
		return stop;
	}, [stop]);

	return { play, stop, unlock, playing, blocked };
}
