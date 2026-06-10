"use client";

import { useCallback, useRef, useState } from "react";

/** Boom-bap beat + crowd noise synthesised via WebAudio — ported from fx.js */
export function useAudioEngine() {
	const ctxRef = useRef<AudioContext | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const nextNoteRef = useRef(0);
	const stepRef = useRef(0);
	const crowdSrcRef = useRef<AudioBufferSourceNode | null>(null);
	const crowdGainRef = useRef<GainNode | null>(null);
	const noiseRef = useRef<AudioBuffer | null>(null);
	const [on, setOn] = useState(false);

	const BPM = 92;
	const BASSLINE = [55, 0, 0, 55, 0, 65.4, 0, 0, 55, 0, 0, 55, 0, 49, 0, 61.7];

	function getCtx() {
		if (!ctxRef.current) {
			const Ctor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			ctxRef.current = new Ctor();
		}
		if (ctxRef.current.state === "suspended") ctxRef.current.resume();
		return ctxRef.current;
	}

	function getNoiseBuf(ctx: AudioContext) {
		if (noiseRef.current) return noiseRef.current;
		const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		noiseRef.current = buf;
		return buf;
	}

	function kick(ctx: AudioContext, t: number) {
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.frequency.setValueAtTime(140, t);
		o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
		g.gain.setValueAtTime(0.9, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
		o.connect(g).connect(ctx.destination);
		o.start(t); o.stop(t + 0.25);
	}

	function snare(ctx: AudioContext, t: number) {
		const s = ctx.createBufferSource(); s.buffer = getNoiseBuf(ctx);
		const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.8;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.5, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
		s.connect(f).connect(g).connect(ctx.destination);
		s.start(t); s.stop(t + 0.2);
	}

	function hat(ctx: AudioContext, t: number, open: boolean) {
		const s = ctx.createBufferSource(); s.buffer = getNoiseBuf(ctx);
		const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.16, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.18 : 0.05));
		s.connect(f).connect(g).connect(ctx.destination);
		s.start(t); s.stop(t + 0.2);
	}

	function bass(ctx: AudioContext, t: number, freq: number, dur: number) {
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.type = "triangle"; o.frequency.value = freq;
		g.gain.setValueAtTime(0.001, t);
		g.gain.linearRampToValueAtTime(0.22, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		o.connect(g).connect(ctx.destination);
		o.start(t); o.stop(t + dur + 0.05);
	}

	function schedule(ctx: AudioContext) {
		const spb = 60 / BPM / 4;
		while (nextNoteRef.current < ctx.currentTime + 0.12) {
			const s16 = stepRef.current % 16;
			if (s16 === 0 || s16 === 7 || s16 === 10) kick(ctx, nextNoteRef.current);
			if (s16 === 4 || s16 === 12) snare(ctx, nextNoteRef.current);
			if (s16 % 2 === 0) hat(ctx, nextNoteRef.current, s16 === 14);
			const b = BASSLINE[s16];
			if (b) bass(ctx, nextNoteRef.current, b, spb * 3);
			nextNoteRef.current += spb;
			stepRef.current++;
		}
		timerRef.current = setTimeout(() => schedule(ctx), 30);
	}

	function startCrowd(ctx: AudioContext) {
		const len = ctx.sampleRate * 3;
		const buf = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const d = buf.getChannelData(ch);
			let last = 0;
			for (let i = 0; i < len; i++) {
				const w = Math.random() * 2 - 1;
				last = (last + 0.02 * w) / 1.02;
				d[i] = last * 3.2;
			}
		}
		const src = ctx.createBufferSource();
		src.buffer = buf; src.loop = true;
		const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
		const gain = ctx.createGain(); gain.gain.value = 0.05;
		src.connect(f).connect(gain).connect(ctx.destination);
		src.start();
		crowdSrcRef.current = src;
		crowdGainRef.current = gain;
	}

	const toggle = useCallback(() => {
		if (on) {
			// Stop everything
			if (timerRef.current) clearTimeout(timerRef.current);
			try {
				crowdSrcRef.current?.stop();
			} catch {
				// Source may already be stopped.
			}
			crowdSrcRef.current = null;
			crowdGainRef.current = null;
			ctxRef.current?.suspend();
			setOn(false);
		} else {
			const ctx = getCtx();
			nextNoteRef.current = ctx.currentTime + 0.06;
			stepRef.current = 0;
			schedule(ctx);
			startCrowd(ctx);
			setOn(true);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [on]);

	return { on, toggle };
}
