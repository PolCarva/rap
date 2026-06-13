import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Esquema D1 (SQLite) para el plano de aplicación. Scaffolding: las tablas
 * quedan definidas y tipadas; las migraciones y el wiring al binding D1 se
 * activan en el paso de persistencia.
 */

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	handle: text("handle").notNull().unique(),
	email: text("email").unique(),
	avatarUrl: text("avatar_url"),
	avatarConfig: text("avatar_config"),
	authProvider: text("auth_provider").notNull().default("guest"),
	isGuest: integer("is_guest", { mode: "boolean" }).notNull().default(true),
	passwordHash: text("password_hash"),
	elo: integer("elo").notNull().default(1000),
	battles: integer("battles").notNull().default(0),
	wins: integer("wins").notNull().default(0),
	draws: integer("draws").notNull().default(0),
	losses: integer("losses").notNull().default(0),
	currentStreak: integer("current_streak").notNull().default(0),
	bestStreak: integer("best_streak").notNull().default(0),
	lastBattleResult: text("last_battle_result"),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const beats = sqliteTable("beats", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	producer: text("producer"),
	audioUrl: text("audio_url").notNull(),
	bpm: integer("bpm"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const userModalityStats = sqliteTable(
	"user_modality_stats",
	{
		userId: text("user_id").notNull().references(() => users.id),
		modality: text("modality").notNull(),
		battles: integer("battles").notNull().default(0),
		wins: integer("wins").notNull().default(0),
		draws: integer("draws").notNull().default(0),
		losses: integer("losses").notNull().default(0),
		totalScore: real("total_score").notNull().default(0),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.userId, table.modality] }),
	}),
);

export const battles = sqliteTable("battles", {
	id: text("id").primaryKey(),
	modality: text("modality").notNull(),
	words: text("words", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	beatId: text("beat_id").references(() => beats.id),
	beatName: text("beat_name"),
	beatAudioUrl: text("beat_audio_url"),
	beatBpm: integer("beat_bpm"),
	player1Id: text("player1_id").references(() => users.id),
	player2Id: text("player2_id").references(() => users.id),
	player1SessionId: text("player1_session_id"),
	player2SessionId: text("player2_session_id"),
	player1Name: text("player1_name").notNull().default("MC 1"),
	player2Name: text("player2_name").notNull().default("MC 2"),
	winner: text("winner"), // "p1" | "p2" | "draw" | null
	scoreP1: real("score_p1"),
	scoreP2: real("score_p2"),
	status: text("status").notNull().default("pending"),
	startedAt: integer("started_at", { mode: "timestamp_ms" }),
	endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

export const battleTurns = sqliteTable("battle_turns", {
	id: text("id").primaryKey(),
	battleId: text("battle_id")
		.notNull()
		.references(() => battles.id),
	role: text("role").notNull(), // "p1" | "p2"
	round: integer("round").notNull(),
	transcript: text("transcript").notNull().default(""),
	audioKey: text("audio_key"), // clave en R2 del audio del turno
});

export const judgments = sqliteTable("judgments", {
	id: text("id").primaryKey(),
	battleId: text("battle_id")
		.notNull()
		.references(() => battles.id),
	winner: text("winner").notNull(),
	scoreP1: real("score_p1").notNull(),
	scoreP2: real("score_p2").notNull(),
	rationale: text("rationale").notNull().default(""),
	detail: text("detail", { mode: "json" }).$type<unknown>(),
	model: text("model").notNull().default(""),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export type User = typeof users.$inferSelect;
export type Beat = typeof beats.$inferSelect;
export type Battle = typeof battles.$inferSelect;
export type BattleTurn = typeof battleTurns.$inferSelect;
export type Judgment = typeof judgments.$inferSelect;
