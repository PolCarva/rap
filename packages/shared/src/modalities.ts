import { z } from "zod";

/**
 * Modalidades de batalla. Cada una define la estructura del enfrentamiento:
 * cuántos turnos rapea cada jugador, cuánto dura cada turno, y si el sistema
 * inyecta palabras/conceptos obligatorios que el juez premia.
 */
export const MODALITY_IDS = ["4x4", "minuto-libre", "palabras", "deconceptos"] as const;

export const modalityIdSchema = z.enum(MODALITY_IDS);
export type ModalityId = z.infer<typeof modalityIdSchema>;

export interface Modality {
	id: ModalityId;
	name: string;
	description: string;
	/** Cantidad de turnos que rapea CADA jugador (rondas). */
	rounds: number;
	/** Segundos objetivo de cada turno (fallback cuando el beat no tiene BPM). */
	turnDurationSec: number;
	/**
	 * Compases exactos por turno (4 tiempos cada uno). Si está definido y el
	 * beat trae BPM, el turno dura exactamente esos compases: el corte cae en
	 * el 1 del compás, nunca en medio de un patrón. Si no, se redondea
	 * turnDurationSec al compás entero más cercano.
	 */
	turnBars?: number;
	/** Si true, el sistema sortea palabras/conceptos obligatorios al iniciar. */
	injectsWords: boolean;
	/** Cantidad de palabras a inyectar cuando injectsWords es true. */
	wordCount: number;
}

export const MODALITIES: Record<ModalityId, Modality> = {
	"4x4": {
		id: "4x4",
		name: "4x4",
		description: "Cuatro compases por cabeza, cuatro idas y vueltas sobre el beat.",
		rounds: 4,
		turnDurationSec: 12,
		turnBars: 4,
		injectsWords: false,
		wordCount: 0,
	},
	"minuto-libre": {
		id: "minuto-libre",
		name: "Minuto libre",
		description: "Un turno por jugador, un minuto de freestyle libre.",
		rounds: 1,
		turnDurationSec: 60,
		injectsWords: false,
		wordCount: 0,
	},
	palabras: {
		id: "palabras",
		name: "Palabras",
		description: "Se sortean palabras obligatorias que hay que incluir y rimar.",
		rounds: 2,
		turnDurationSec: 40,
		injectsWords: true,
		wordCount: 4,
	},
	deconceptos: {
		id: "deconceptos",
		name: "De conceptos",
		description: "Se sortean conceptos a desarrollar; suma encadenarlos con ingenio.",
		rounds: 2,
		turnDurationSec: 45,
		injectsWords: true,
		wordCount: 2,
	},
};

export function getModality(id: ModalityId): Modality {
	return MODALITIES[id];
}

// ---------------------------------------------------------------------------
// Tiempos musicales: el cronómetro respeta el compás del beat.
// ---------------------------------------------------------------------------

export const BEATS_PER_BAR = 4;

/** Duración de un compás (4 tiempos) en ms. */
export function barMs(bpm: number): number {
	return (60_000 / bpm) * BEATS_PER_BAR;
}

/**
 * Duración real del turno en ms. Con BPM conocido se cuantiza a compases
 * enteros (turnBars exactos, o turnDurationSec redondeado al compás más
 * cercano) para que el corte nunca caiga en medio de un patrón.
 */
export function turnDurationMs(mod: Modality, bpm: number | null | undefined): number {
	const target = mod.turnDurationSec * 1000;
	if (!bpm) return target;
	const bar = barMs(bpm);
	const bars = mod.turnBars ?? Math.max(1, Math.round(target / bar));
	return Math.round(bars * bar);
}

/**
 * Duración de la cuenta atrás en ms: compases enteros (mínimo ~3s) para que
 * el primer turno arranque exactamente en el 1 del compás.
 */
export function countdownMs(bpm: number | null | undefined): number {
	const base = 3000;
	if (!bpm) return base;
	const bar = barMs(bpm);
	return Math.round(bar * Math.max(1, Math.ceil(base / bar)));
}

/**
 * Quién abre cada ronda: se alterna (ronda 1 abre p1, ronda 2 abre p2, …) y
 * cada réplica invierte el orden, como el sorteo de una batalla real. El que
 * cierra una ronda no cierra la siguiente.
 */
export function roundStarter(round: number, replicaCount: number): "p1" | "p2" {
	return (round + replicaCount) % 2 === 1 ? "p1" : "p2";
}
