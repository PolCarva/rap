"use client";

import { synthStyleOf, type Beat, type SynthStyle } from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reproductor de beats. Soporta dos fuentes:
 * - `synth:<estilo>`: batería + bajo sintetizados con WebAudio al BPM del beat.
 *   Cero assets, loop perfecto y BPM exacto.
 * - URL http(s): un <audio> en loop (beats subidos por el backoffice).
 *
 * `blocked` queda true si el navegador bloqueó el autoplay; `unlock()` debe
 * llamarse desde un gesto del usuario.
 */

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
	const beatRef = useRef<Beat | null>(null);

	const stop = useCallback(() => {
		engineRef.current?.stop();
		engineRef.current = null;
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.src = "";
			audioRef.current = null;
		}
		beatRef.current = null;
		setPlaying(null);
		setBlocked(false);
	}, []);

	const play = useCallback(
		async (beat: Beat, volume = 0.4) => {
			if (beatRef.current?.id === beat.id && !blocked) return;
			stop();
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
		if (beat) void play(beat);
	}, [play]);

	useEffect(() => stop, [stop]);

	return { play, stop, unlock, playing, blocked };
}
