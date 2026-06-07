import { z } from "zod";
import { modalityIdSchema } from "./modalities";

/** Rol de cada jugador dentro de una batalla. */
export const roleSchema = z.enum(["p1", "p2"]);
export type Role = z.infer<typeof roleSchema>;

/** Fases de la máquina de estados de la sala de batalla. */
export const phaseSchema = z.enum([
	"lobby", // esperando a que ambos se conecten
	"ready_check", // ambos conectados, esperando "listo"
	"countdown", // cuenta atrás antes del primer turno
	"turn", // un jugador rapea (ver activeRole/round)
	"judging", // la IA está evaluando
	"result", // veredicto listo
	"aborted", // alguien abandonó
]);
export type Phase = z.infer<typeof phaseSchema>;

// ---------------------------------------------------------------------------
// Matchmaking: cliente <-> Matchmaking DO
// ---------------------------------------------------------------------------

export const mmClientMessageSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("queue"), modality: modalityIdSchema, name: z.string().min(1).max(40) }),
	z.object({ kind: z.literal("cancel") }),
]);
export type MmClientMessage = z.infer<typeof mmClientMessageSchema>;

export const mmServerMessageSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("queued"), modality: modalityIdSchema }),
	z.object({
		kind: z.literal("matched"),
		battleId: z.string(),
		role: roleSchema,
		modality: modalityIdSchema,
		words: z.array(z.string()),
	}),
	z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type MmServerMessage = z.infer<typeof mmServerMessageSchema>;

// ---------------------------------------------------------------------------
// Sala de batalla: cliente <-> Battle Room DO
// ---------------------------------------------------------------------------

export const roomClientMessageSchema = z.discriminatedUnion("kind", [
	/** Identificación al conectar el WebSocket. */
	z.object({ kind: z.literal("hello"), role: roleSchema, name: z.string().min(1).max(40) }),
	/** El jugador confirma que está listo (cámara/mic probados). */
	z.object({ kind: z.literal("ready") }),
	/** Caption en vivo (parcial) mientras rapea. En el skeleton se tipea. */
	z.object({ kind: z.literal("caption"), text: z.string().max(2000) }),
	/** Transcripción final del turno del jugador activo. Cierra su turno. */
	z.object({ kind: z.literal("verse"), text: z.string().max(4000) }),
	/** Abandonar la batalla. */
	z.object({ kind: z.literal("leave") }),
]);
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;

/** Estado de un jugador visible para ambos. */
export const playerStateSchema = z.object({
	name: z.string(),
	connected: z.boolean(),
	ready: z.boolean(),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

/** Veredicto del juez (se completa en el paso de IA; aquí va el contrato). */
export const verdictSchema = z.object({
	winner: z.union([roleSchema, z.literal("draw")]),
	scores: z.object({ p1: z.number(), p2: z.number() }),
	rationale: z.string(),
});
export type Verdict = z.infer<typeof verdictSchema>;

/** Estado completo y autoritativo de la batalla (lo emite el DO). */
export const battleStateSchema = z.object({
	battleId: z.string(),
	modality: modalityIdSchema,
	words: z.array(z.string()),
	phase: phaseSchema,
	/** Ronda actual (1-indexed). */
	round: z.number().int(),
	/** Total de rondas por jugador según la modalidad. */
	totalRounds: z.number().int(),
	/** Quién rapea ahora (solo válido en fase "turn"). */
	activeRole: roleSchema.nullable(),
	/** Epoch ms en que termina el turno/cuenta actual, para timers del cliente. */
	deadline: z.number().nullable(),
	players: z.object({ p1: playerStateSchema, p2: playerStateSchema }),
	/** Versos enviados por cada jugador, en orden de ronda. */
	verses: z.object({ p1: z.array(z.string()), p2: z.array(z.string()) }),
	verdict: verdictSchema.nullable(),
});
export type BattleState = z.infer<typeof battleStateSchema>;

export const roomServerMessageSchema = z.discriminatedUnion("kind", [
	/** Estado completo de la batalla. */
	z.object({ kind: z.literal("snapshot"), state: battleStateSchema }),
	/** Caption en vivo de un jugador retransmitido al rival. */
	z.object({ kind: z.literal("caption"), role: roleSchema, text: z.string() }),
	z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;

/** Mensaje interno: Matchmaking DO -> Battle Room DO para inicializar la sala. */
export const roomInitSchema = z.object({
	battleId: z.string(),
	modality: modalityIdSchema,
	words: z.array(z.string()),
	players: z.object({ p1: z.string(), p2: z.string() }),
});
export type RoomInit = z.infer<typeof roomInitSchema>;
