"use client";

/**
 * Detección de BPM en el navegador. Filtra el audio con un lowpass para aislar
 * el bombo, detecta picos de energía y arma un histograma de intervalos entre
 * picos; el intervalo dominante (normalizado a 70–180 BPM) es el tempo.
 */

const ANALYZE_SECONDS = 30;
const MIN_BPM = 70;
const MAX_BPM = 180;

function findPeaks(data: Float32Array, sampleRate: number): number[] {
	let max = 0;
	for (let i = 0; i < data.length; i++) {
		const v = Math.abs(data[i]!);
		if (v > max) max = v;
	}
	const minGap = Math.floor(sampleRate * 0.25);

	// Bajar el umbral hasta juntar suficientes picos para un histograma estable.
	for (let threshold = 0.9; threshold >= 0.3; threshold -= 0.05) {
		const cut = max * threshold;
		const peaks: number[] = [];
		let i = 0;
		while (i < data.length) {
			if (Math.abs(data[i]!) >= cut) {
				// Refinar al máximo local dentro de la ventana.
				let best = i;
				const end = Math.min(data.length, i + minGap);
				for (let j = i; j < end; j++) {
					if (Math.abs(data[j]!) > Math.abs(data[best]!)) best = j;
				}
				peaks.push(best);
				i = best + minGap;
			} else {
				i++;
			}
		}
		if (peaks.length >= 28) return peaks;
	}
	return [];
}

function normalizeTempo(bpm: number): number {
	let t = bpm;
	while (t < MIN_BPM) t *= 2;
	while (t > MAX_BPM) t /= 2;
	return t;
}

function bpmFromPeaks(peaks: number[], sampleRate: number): number | null {
	if (peaks.length < 8) return null;
	const counts = new Map<number, number>();
	// Comparar cada pico con sus 10 vecinos siguientes para capturar el pulso
	// aunque haya golpes intermedios.
	for (let i = 0; i < peaks.length; i++) {
		for (let j = i + 1; j < Math.min(peaks.length, i + 10); j++) {
			const seconds = (peaks[j]! - peaks[i]!) / sampleRate;
			if (seconds < 0.2 || seconds > 4) continue;
			const bpm = Math.round(normalizeTempo(60 / seconds));
			counts.set(bpm, (counts.get(bpm) ?? 0) + 1);
		}
	}
	let best: number | null = null;
	let bestCount = 0;
	for (const [bpm, count] of counts) {
		// Sumar vecinos ±1 BPM para tolerar jitter.
		const total = count + (counts.get(bpm - 1) ?? 0) + (counts.get(bpm + 1) ?? 0);
		if (total > bestCount) {
			bestCount = total;
			best = bpm;
		}
	}
	return best;
}

export async function detectBpm(audio: AudioBuffer): Promise<number | null> {
	const length = Math.min(audio.length, audio.sampleRate * ANALYZE_SECONDS);
	const offline = new OfflineAudioContext(1, length, audio.sampleRate);
	const src = offline.createBufferSource();
	src.buffer = audio;
	const lowpass = offline.createBiquadFilter();
	lowpass.type = "lowpass";
	lowpass.frequency.value = 150;
	lowpass.Q.value = 1;
	src.connect(lowpass);
	lowpass.connect(offline.destination);
	src.start(0);
	const rendered = await offline.startRendering();
	const peaks = findPeaks(rendered.getChannelData(0), rendered.sampleRate);
	return bpmFromPeaks(peaks, rendered.sampleRate);
}

/** Descarga y analiza una URL de audio. Lanza si la URL no es accesible (CORS). */
export async function detectBpmFromUrl(url: string): Promise<number | null> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`No se pudo descargar el audio (${res.status})`);
	const raw = await res.arrayBuffer();
	const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const ctx = new Ctor();
	try {
		const decoded = await ctx.decodeAudioData(raw);
		return await detectBpm(decoded);
	} finally {
		void ctx.close().catch(() => {});
	}
}
