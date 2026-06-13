import { z } from "zod";
import { modalityIdSchema } from "./modalities";

/** Rol de cada jugador dentro de una batalla. */
export const roleSchema = z.enum(["p1", "p2"]);
export type Role = z.infer<typeof roleSchema>;

export const playerIdentitySchema = z.object({
	sessionId: z.string().min(1).max(80),
	userId: z.string().min(1).max(80).nullable(),
	name: z.string().min(1).max(40),
	isGuest: z.boolean(),
});
export type PlayerIdentity = z.infer<typeof playerIdentitySchema>;

/** Beat reproducido durante los turnos. Del backoffice (URL) o sintetizado (`synth:<estilo>`). */
export const beatSchema = z.object({
	id: z.string().min(1).max(80),
	name: z.string().min(1).max(80),
	producer: z.string().max(80).nullable().default(null),
	audioUrl: z.union([z.string().url(), z.string().regex(/^synth:[a-z0-9-]+$/)]),
	bpm: z.number().int().min(40).max(220).nullable().default(null),
	isActive: z.boolean().default(true),
});
export type Beat = z.infer<typeof beatSchema>;

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
	z.object({
		kind: z.literal("queue"),
		modality: modalityIdSchema,
		name: z.string().min(1).max(40),
		beatId: z.string().min(1).max(80).nullable().optional(),
		sessionId: z.string().min(1).max(80).optional(),
		userId: z.string().min(1).max(80).nullable().optional(),
		isGuest: z.boolean().optional(),
		/** Solo dev/local: crea una batalla inmediata contra un bot. */
		devBot: z.boolean().optional(),
		/** Token firmado por la web que respalda el userId (modo rankeado). */
		authToken: z.string().max(600).nullable().optional(),
	}),
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
		beat: beatSchema.nullable().optional(),
		sessionId: z.string().optional(),
	}),
	z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type MmServerMessage = z.infer<typeof mmServerMessageSchema>;

// ---------------------------------------------------------------------------
// Sala de batalla: cliente <-> Battle Room DO
// ---------------------------------------------------------------------------

export const rtcSessionDescriptionSchema = z.object({
	type: z.enum(["offer", "answer", "pranswer", "rollback"]),
	sdp: z.string().optional(),
});

export const rtcIceCandidateSchema = z.object({
	candidate: z.string(),
	sdpMid: z.string().nullable().optional(),
	sdpMLineIndex: z.number().int().nullable().optional(),
	usernameFragment: z.string().nullable().optional(),
});

export const rtcSignalSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("offer"), description: rtcSessionDescriptionSchema }),
	z.object({ type: z.literal("answer"), description: rtcSessionDescriptionSchema }),
	z.object({ type: z.literal("ice"), candidate: rtcIceCandidateSchema }),
	z.object({ type: z.literal("media-ready") }),
]);
export type RtcSignal = z.infer<typeof rtcSignalSchema>;

export const roomClientMessageSchema = z.discriminatedUnion("kind", [
	/** Identificación al conectar el WebSocket. */
	z.object({
		kind: z.literal("hello"),
		role: roleSchema,
		name: z.string().min(1).max(40),
		sessionId: z.string().min(1).max(80).optional(),
		userId: z.string().min(1).max(80).nullable().optional(),
		isGuest: z.boolean().optional(),
	}),
	/** El jugador confirma que está listo (cámara/mic probados). */
	z.object({ kind: z.literal("ready") }),
	/** Caption en vivo (parcial) mientras rapea. En el skeleton se tipea. */
	z.object({ kind: z.literal("caption"), text: z.string().max(2000) }),
	/** Señalización WebRTC peer-to-peer para audio/video entre rivales. */
	z.object({ kind: z.literal("signal"), signal: rtcSignalSchema }),
	/** Transcripción final del turno del jugador activo. Cierra su turno. */
	z.object({ kind: z.literal("verse"), text: z.string().max(4000) }),
	/** Pedir revancha tras el veredicto; con ambos pedidos arranca otra batalla. */
	z.object({ kind: z.literal("rematch") }),
	/** Abandonar la batalla. */
	z.object({ kind: z.literal("leave") }),
]);
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;

/** Estado de un jugador visible para ambos. */
export const playerStateSchema = z.object({
	name: z.string(),
	sessionId: z.string().nullable().default(null),
	userId: z.string().nullable().default(null),
	isGuest: z.boolean().default(true),
	isBot: z.boolean().default(false),
	connected: z.boolean(),
	ready: z.boolean(),
	/** Pidió revancha en la pantalla de resultado. */
	wantsRematch: z.boolean().default(false),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

/** Criterios con los que el juez evalúa a cada jugador (0-10 cada uno). */
export const CRITERIA = ["flow", "rimas", "punchlines", "respuesta", "palabras"] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Etiquetas legibles de cada criterio para la UI. */
export const CRITERIA_LABELS: Record<Criterion, string> = {
	flow: "Flow",
	rimas: "Rimas",
	punchlines: "Punchlines",
	respuesta: "Respuesta",
	palabras: "Palabras",
};

/** Desglose del juez para un jugador. `palabras` es null si la modalidad no las usa. */
export const playerVerdictSchema = z.object({
	criteria: z.object({
		flow: z.number().min(0).max(10),
		rimas: z.number().min(0).max(10),
		punchlines: z.number().min(0).max(10),
		respuesta: z.number().min(0).max(10),
		palabras: z.number().min(0).max(10).nullable(),
	}),
	total: z.number().min(0).max(100),
	comment: z.string(),
});
export type PlayerVerdict = z.infer<typeof playerVerdictSchema>;

export const judgeVoteSchema = z.object({
	judge: z.number().int().min(1).max(3),
	vote: z.union([roleSchema, z.literal("replica")]),
});
export type JudgeVote = z.infer<typeof judgeVoteSchema>;

export const eloSideSchema = z.object({
	before: z.number().nullable(),
	after: z.number().nullable(),
	delta: z.number(),
});
export const eloImpactSchema = z.object({
	ranked: z.boolean(),
	p1: eloSideSchema,
	p2: eloSideSchema,
	reason: z.string().optional(),
});
export type EloImpact = z.infer<typeof eloImpactSchema>;

/** Veredicto del juez. `detail`/`model` los completa el juez IA (la heurística no). */
export const verdictSchema = z.object({
	winner: z.union([roleSchema, z.literal("draw")]),
	scores: z.object({ p1: z.number(), p2: z.number() }),
	judges: z.array(judgeVoteSchema).length(3),
	elo: eloImpactSchema.nullable().optional(),
	rationale: z.string(),
	detail: z.object({ p1: playerVerdictSchema, p2: playerVerdictSchema }).optional(),
	model: z.string().optional(),
});
export type Verdict = z.infer<typeof verdictSchema>;

export const battleSummarySchema = z.object({
	id: z.string(),
	modality: modalityIdSchema,
	words: z.array(z.string()),
	player1Name: z.string(),
	player2Name: z.string(),
	winner: z.union([roleSchema, z.literal("draw")]).nullable(),
	scoreP1: z.number().nullable(),
	scoreP2: z.number().nullable(),
	status: z.string(),
	startedAt: z.number().nullable(),
	endedAt: z.number().nullable(),
});
export type BattleSummary = z.infer<typeof battleSummarySchema>;

export const wordPlanSchema = z.object({
	p1: z.array(z.array(z.string())),
	p2: z.array(z.array(z.string())),
});
export type WordPlanState = z.infer<typeof wordPlanSchema>;

export const rankingEntrySchema = z.object({
	id: z.string(),
	handle: z.string(),
	elo: z.number(),
	battles: z.number(),
	wins: z.number(),
	draws: z.number(),
	losses: z.number(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

/** Estado completo y autoritativo de la batalla (lo emite el DO). */
export const battleStateSchema = z.object({
	battleId: z.string(),
	modality: modalityIdSchema,
	words: z.array(z.string()),
	wordPlan: wordPlanSchema.nullable().default(null),
	beat: beatSchema.nullable(),
	phase: phaseSchema,
	/** Ronda actual (1-indexed). */
	round: z.number().int(),
	/** Total de rondas por jugador según la modalidad. */
	totalRounds: z.number().int(),
	/** Quién rapea ahora (solo válido en fase "turn"). */
	activeRole: roleSchema.nullable(),
	/** Epoch ms en que empezó el turno actual, para prompts por tiempo/compás. */
	turnStartedAt: z.number().nullable().default(null),
	/** Epoch ms en que termina el turno/cuenta actual, para timers del cliente. */
	deadline: z.number().nullable(),
	players: z.object({ p1: playerStateSchema, p2: playerStateSchema }),
	/** Versos enviados por cada jugador, en orden de ronda. */
	verses: z.object({ p1: z.array(z.string()), p2: z.array(z.string()) }),
	verdict: verdictSchema.nullable(),
	replicaCount: z.number().int().min(0).default(0),
});
export type BattleState = z.infer<typeof battleStateSchema>;

export const roomServerMessageSchema = z.discriminatedUnion("kind", [
	/** Estado completo de la batalla. */
	z.object({ kind: z.literal("snapshot"), state: battleStateSchema }),
	/** Caption en vivo de un jugador retransmitido al rival. */
	z.object({ kind: z.literal("caption"), role: roleSchema, text: z.string() }),
	/** Señalización WebRTC reenviada al rival. */
	z.object({ kind: z.literal("signal"), role: roleSchema, signal: rtcSignalSchema }),
	z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;

/** Mensaje interno: Matchmaking DO -> Battle Room DO para inicializar la sala. */
export const roomInitSchema = z.object({
	battleId: z.string(),
	modality: modalityIdSchema,
	words: z.array(z.string()),
	wordPlan: wordPlanSchema.nullable().optional(),
	beat: beatSchema.nullable().optional(),
	players: z.object({
		p1: z.union([z.string(), playerIdentitySchema]),
		p2: z.union([z.string(), playerIdentitySchema]),
	}),
});
export type RoomInit = z.infer<typeof roomInitSchema>;
