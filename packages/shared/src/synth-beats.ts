import type { Beat } from "./protocol";

/**
 * Beats sintetizados integrados. No dependen de archivos de audio ni de la DB:
 * el cliente los genera con WebAudio a partir del estilo y el BPM. Garantizan
 * que SIEMPRE haya beats disponibles, sin licencias ni hosting.
 *
 * Convención: `audioUrl` usa el esquema `synth:<estilo>` y el id es
 * `synth:<estilo>-<bpm>`. El motor cliente (useBeatPlayer) interpreta el estilo.
 */
export type SynthStyle = "boombap" | "trap" | "dembow" | "doblet";

export interface SynthBeat extends Beat {
	style: SynthStyle;
}

function synth(style: SynthStyle, name: string, bpm: number): SynthBeat {
	return {
		id: `synth:${style}-${bpm}`,
		name,
		producer: "RAPEAR ONLINE",
		audioUrl: `synth:${style}`,
		bpm,
		isActive: true,
		style,
	};
}

export const SYNTH_BEATS: SynthBeat[] = [
	synth("boombap", "Callejón 90", 90),
	synth("boombap", "Vieja Escuela", 96),
	synth("trap", "Presión 808", 140),
	synth("trap", "Medianoche", 150),
	synth("dembow", "Bajo Fuego", 97),
	synth("doblet", "Doble Tempo", 100),
];

export function isSynthBeatId(id: string | null | undefined): boolean {
	return !!id && id.startsWith("synth:");
}

export function getSynthBeat(id: string): SynthBeat | null {
	return SYNTH_BEATS.find((beat) => beat.id === id) ?? null;
}

export function randomSynthBeat(): SynthBeat {
	return SYNTH_BEATS[Math.floor(Math.random() * SYNTH_BEATS.length)]!;
}

/** Estilo de un beat synth a partir de su audioUrl (`synth:<estilo>`). */
export function synthStyleOf(beat: Beat): SynthStyle | null {
	if (!beat.audioUrl.startsWith("synth:")) return null;
	const style = beat.audioUrl.slice("synth:".length) as SynthStyle;
	return (["boombap", "trap", "dembow", "doblet"] as const).includes(style) ? style : "boombap";
}
