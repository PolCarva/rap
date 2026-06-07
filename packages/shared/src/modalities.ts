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
	/** Segundos de duración de cada turno. */
	turnDurationSec: number;
	/** Si true, el sistema sortea palabras/conceptos obligatorios al iniciar. */
	injectsWords: boolean;
	/** Cantidad de palabras a inyectar cuando injectsWords es true. */
	wordCount: number;
}

export const MODALITIES: Record<ModalityId, Modality> = {
	"4x4": {
		id: "4x4",
		name: "4x4",
		description: "Cuatro versos por turno, varias rondas de ida y vuelta.",
		rounds: 2,
		turnDurationSec: 30,
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
