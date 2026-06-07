import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
	elo: integer("elo").notNull().default(1000),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const battles = sqliteTable("battles", {
	id: text("id").primaryKey(),
	modality: text("modality").notNull(),
	words: text("words", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	player1Id: text("player1_id").references(() => users.id),
	player2Id: text("player2_id").references(() => users.id),
	winner: text("winner"), // "p1" | "p2" | "draw" | null
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
	model: text("model").notNull().default(""),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export type User = typeof users.$inferSelect;
export type Battle = typeof battles.$inferSelect;
export type BattleTurn = typeof battleTurns.$inferSelect;
export type Judgment = typeof judgments.$inferSelect;
