export interface PersistedIdentity {
	sessionId: string;
	userId: string | null;
	name: string;
	isGuest: boolean;
}

export interface PersistedBeat {
	id: string;
	name: string;
	producer: string | null;
	audioUrl: string;
	bpm: number | null;
	isActive: boolean;
}

export interface BattlePersistInput {
	id: string;
	modality: string;
	words: string[];
	beat: PersistedBeat | null;
	players: {
		p1: PersistedIdentity;
		p2: PersistedIdentity;
	};
	startedAt?: number;
}

export interface BattleResultInput extends BattlePersistInput {
	winner: "p1" | "p2" | "draw";
	scoreP1: number;
	scoreP2: number;
	rationale: string;
	model?: string;
	detail?: unknown;
	verses: {
		p1: string[];
		p2: string[];
	};
	endedAt?: number;
}

export interface EloSideResult {
	before: number | null;
	after: number | null;
	delta: number;
}

export interface EloResult {
	ranked: boolean;
	p1: EloSideResult;
	p2: EloSideResult;
	reason?: string;
}

export interface BeatRow {
	id: string;
	name: string;
	producer: string | null;
	audioUrl: string;
	bpm: number | null;
	isActive: number;
	createdAt: number;
	updatedAt: number;
}

export interface BeatInput {
	id?: string;
	name: string;
	producer?: string | null;
	audioUrl: string;
	bpm?: number | null;
	isActive?: boolean;
}

export interface RankingRow {
	id: string;
	handle: string;
	elo: number;
	battles: number;
	wins: number;
	draws: number;
	losses: number;
	currentStreak: number;
	bestStreak: number;
}

export interface BattleSummaryRow {
	id: string;
	modality: string;
	words: string;
	player1Id: string | null;
	player2Id: string | null;
	player1Name: string;
	player2Name: string;
	beatId: string | null;
	beatName: string | null;
	beatAudioUrl: string | null;
	beatBpm: number | null;
	winner: "p1" | "p2" | "draw" | null;
	scoreP1: number | null;
	scoreP2: number | null;
	status: string;
	startedAt: number | null;
	endedAt: number | null;
}

export interface ModalityStatRow {
	modality: string;
	battles: number;
	wins: number;
	draws: number;
	losses: number;
	totalScore: number;
}

export interface ProfileRow extends RankingRow {
	isGuest: number;
	email: string | null;
	avatarUrl: string | null;
	createdAt: number;
	lastSeenAt: number;
	lastBattleResult: string | null;
}

export interface UserAuthRow {
	id: string;
	handle: string;
	email: string | null;
	isGuest: number;
	passwordHash: string | null;
	elo: number;
	battles: number;
	wins: number;
	draws: number;
	losses: number;
	currentStreak: number;
	bestStreak: number;
}

function slug(input: string): string {
	return input
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 28) || "mc";
}

function userIdFor(identity: PersistedIdentity): string {
	return identity.userId ?? `guest:${identity.sessionId}`;
}

function battleUserId(identity: PersistedIdentity): string | null {
	if (identity.isGuest || !identity.userId) return null;
	return identity.userId;
}

function handleFor(identity: PersistedIdentity): string {
	const base = slug(identity.name);
	if (!identity.isGuest) return base;
	return `${base}-${identity.sessionId.slice(-6).toLowerCase()}`;
}

function normalizeBeat(row: BeatRow): PersistedBeat {
	return {
		id: row.id,
		name: row.name,
		producer: row.producer,
		audioUrl: row.audioUrl,
		bpm: row.bpm,
		isActive: Boolean(row.isActive),
	};
}

function emptyElo(reason: string, p1Before: number | null = null, p2Before: number | null = null): EloResult {
	return {
		ranked: false,
		p1: { before: p1Before, after: p1Before, delta: 0 },
		p2: { before: p2Before, after: p2Before, delta: 0 },
		reason,
	};
}

function expectedScore(eloA: number, eloB: number): number {
	return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function kFactor(p1Battles: number, p2Battles: number): number {
	const leastExperienced = Math.min(p1Battles, p2Battles);
	if (leastExperienced < 10) return 40;
	if (leastExperienced < 30) return 32;
	return 24;
}

function calculateElo(input: {
	p1Elo: number;
	p2Elo: number;
	p1Battles: number;
	p2Battles: number;
	winner: "p1" | "p2" | "draw";
	scoreP1: number;
	scoreP2: number;
}): EloResult {
	const expectedP1 = expectedScore(input.p1Elo, input.p2Elo);
	const actualP1 = input.winner === "draw" ? 0.5 : input.winner === "p1" ? 1 : 0;
	const baseK = kFactor(input.p1Battles, input.p2Battles);
	const scoreDiff = Math.abs(input.scoreP1 - input.scoreP2);
	const marginMultiplier = input.winner === "draw" ? 1 : Math.min(1.35, 1 + Math.max(0, scoreDiff - 6) / 90);
	let p1Delta = Math.round(baseK * marginMultiplier * (actualP1 - expectedP1));

	if (input.winner !== "draw" && p1Delta === 0) {
		p1Delta = input.winner === "p1" ? 1 : -1;
	}

	const p1After = Math.max(100, input.p1Elo + p1Delta);
	const p2After = Math.max(100, input.p2Elo - p1Delta);
	return {
		ranked: true,
		p1: { before: input.p1Elo, after: p1After, delta: p1After - input.p1Elo },
		p2: { before: input.p2Elo, after: p2After, delta: p2After - input.p2Elo },
	};
}

export async function upsertUser(db: D1Database, identity: PersistedIdentity): Promise<string> {
	const id = userIdFor(identity);
	const now = Date.now();
	if (identity.isGuest) {
		await db
			.prepare(
				`INSERT INTO users (id, handle, auth_provider, is_guest, last_seen_at)
				 VALUES (?, ?, 'guest', 1, ?)
				 ON CONFLICT(id) DO UPDATE SET
					handle = excluded.handle,
					auth_provider = 'guest',
					is_guest = 1,
					last_seen_at = excluded.last_seen_at`,
			)
			.bind(id, handleFor(identity), now)
			.run();
		return id;
	}

	await db
		.prepare(
			`INSERT INTO users (id, handle, auth_provider, is_guest, last_seen_at)
			 VALUES (?, ?, 'local', 0, ?)
			 ON CONFLICT(id) DO UPDATE SET
				auth_provider = 'local',
				is_guest = 0,
				last_seen_at = excluded.last_seen_at`,
		)
		.bind(id, handleFor(identity), now)
		.run();
	return id;
}

export async function updateUserHandle(
	db: D1Database,
	userId: string,
	handleInput: string,
): Promise<{ handle: string } | { error: string }> {
	const handle = slug(handleInput);
	if (handle.length < 2) return { error: "El AKA debe tener al menos 2 caracteres" };
	try {
		const result = await db
			.prepare(
				`UPDATE users
				 SET handle = ?, last_seen_at = ?
				 WHERE id = ? AND is_guest = 0`,
			)
			.bind(handle, Date.now(), userId)
			.run();
		if (!result.success) return { error: "No se pudo actualizar el AKA" };
		return { handle };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes("UNIQUE")) return { error: "Ese AKA ya está en uso" };
		return { error: "No se pudo actualizar el AKA" };
	}
}

export async function registerUser(
	db: D1Database,
	input: { name: string; email: string; passwordHash: string },
): Promise<{ id: string; handle: string } | { error: string }> {
	const id = `local:${input.email.trim().toLowerCase()}`;
	const handle = slug(input.name);
	const now = Date.now();
	try {
		await db
			.prepare(
				`INSERT INTO users (id, handle, email, auth_provider, is_guest, password_hash, created_at, last_seen_at)
				 VALUES (?, ?, ?, 'local', 0, ?, ?, ?)`,
			)
			.bind(id, handle, input.email.trim().toLowerCase(), input.passwordHash, now, now)
			.run();
		return { id, handle };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes("UNIQUE")) {
			return { error: "El email o handle ya está en uso" };
		}
		return { error: "Error al registrar" };
	}
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserAuthRow | null> {
	return db
		.prepare(
			`SELECT id, handle, email, is_guest AS isGuest, password_hash AS passwordHash,
				elo, battles, wins, draws, losses, current_streak AS currentStreak, best_streak AS bestStreak
			 FROM users WHERE email = ? LIMIT 1`,
		)
		.bind(email.trim().toLowerCase())
		.first<UserAuthRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserAuthRow | null> {
	return db
		.prepare(
			`SELECT id, handle, email, is_guest AS isGuest, password_hash AS passwordHash,
				elo, battles, wins, draws, losses, current_streak AS currentStreak, best_streak AS bestStreak
			 FROM users WHERE id = ? LIMIT 1`,
		)
		.bind(id)
		.first<UserAuthRow>();
}

export async function listBeats(db: D1Database, includeInactive = false): Promise<PersistedBeat[]> {
	const result = await db
		.prepare(
			`SELECT id, name, producer, audio_url AS audioUrl, bpm, is_active AS isActive,
				created_at AS createdAt, updated_at AS updatedAt
			 FROM beats
			 ${includeInactive ? "" : "WHERE is_active = 1"}
			 ORDER BY is_active DESC, updated_at DESC, name ASC`,
		)
		.all<BeatRow>();
	return (result.results ?? []).map(normalizeBeat);
}

export async function getBeatById(db: D1Database, id: string): Promise<PersistedBeat | null> {
	const row = await db
		.prepare(
			`SELECT id, name, producer, audio_url AS audioUrl, bpm, is_active AS isActive,
				created_at AS createdAt, updated_at AS updatedAt
			 FROM beats
			 WHERE id = ?
			 LIMIT 1`,
		)
		.bind(id)
		.first<BeatRow>();
	return row ? normalizeBeat(row) : null;
}

export async function pickBeat(db: D1Database, preferredId?: string | null): Promise<PersistedBeat | null> {
	if (preferredId) {
		const preferred = await db
			.prepare(
				`SELECT id, name, producer, audio_url AS audioUrl, bpm, is_active AS isActive,
					created_at AS createdAt, updated_at AS updatedAt
				 FROM beats
				 WHERE id = ? AND is_active = 1
				 LIMIT 1`,
			)
			.bind(preferredId)
			.first<BeatRow>();
		if (preferred) return normalizeBeat(preferred);
	}

	const random = await db
		.prepare(
			`SELECT id, name, producer, audio_url AS audioUrl, bpm, is_active AS isActive,
				created_at AS createdAt, updated_at AS updatedAt
			 FROM beats
			 WHERE is_active = 1
			 ORDER BY RANDOM()
			 LIMIT 1`,
		)
		.first<BeatRow>();
	return random ? normalizeBeat(random) : null;
}

export async function upsertBeat(db: D1Database, input: BeatInput): Promise<PersistedBeat> {
	const id = input.id?.trim() || `beat_${crypto.randomUUID()}`;
	const now = Date.now();
	const name = input.name.trim();
	const producer = input.producer?.trim() || null;
	const audioUrl = input.audioUrl.trim();
	const bpm = input.bpm ?? null;
	const isActive = input.isActive ?? true;

	await db
		.prepare(
			`INSERT INTO beats (id, name, producer, audio_url, bpm, is_active, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				name = excluded.name,
				producer = excluded.producer,
				audio_url = excluded.audio_url,
				bpm = excluded.bpm,
				is_active = excluded.is_active,
				updated_at = excluded.updated_at`,
		)
		.bind(id, name, producer, audioUrl, bpm, isActive ? 1 : 0, now, now)
		.run();

	const beat = await getBeatById(db, id);
	if (!beat) throw new Error("No se pudo guardar el beat");
	return beat;
}

export async function deleteBeat(db: D1Database, id: string): Promise<void> {
	await db.prepare(`DELETE FROM beats WHERE id = ?`).bind(id).run();
}

export async function recordBattleStart(db: D1Database, input: BattlePersistInput): Promise<void> {
	const p1Id = battleUserId(input.players.p1);
	const p2Id = battleUserId(input.players.p2);
	if (p1Id) await upsertUser(db, input.players.p1);
	if (p2Id) await upsertUser(db, input.players.p2);
	await db
		.prepare(
			`INSERT INTO battles (
				id, modality, words, beat_id, beat_name, beat_audio_url, beat_bpm,
				player1_id, player2_id, player1_session_id, player2_session_id,
				player1_name, player2_name, status, started_at
			 )
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
			 ON CONFLICT(id) DO UPDATE SET
				status = 'active',
				beat_id = excluded.beat_id,
				beat_name = excluded.beat_name,
				beat_audio_url = excluded.beat_audio_url,
				beat_bpm = excluded.beat_bpm,
				player1_id = excluded.player1_id,
				player2_id = excluded.player2_id,
				player1_session_id = excluded.player1_session_id,
				player2_session_id = excluded.player2_session_id,
				player1_name = excluded.player1_name,
				player2_name = excluded.player2_name,
				started_at = COALESCE(battles.started_at, excluded.started_at)`,
		)
		.bind(
			input.id,
			input.modality,
			JSON.stringify(input.words),
			input.beat?.id ?? null,
			input.beat?.name ?? null,
			input.beat?.audioUrl ?? null,
			input.beat?.bpm ?? null,
			p1Id,
			p2Id,
			input.players.p1.sessionId,
			input.players.p2.sessionId,
			input.players.p1.name,
			input.players.p2.name,
			input.startedAt ?? Date.now(),
		)
		.run();
}

export async function recordBattleResult(db: D1Database, input: BattleResultInput): Promise<EloResult> {
	const p1Id = battleUserId(input.players.p1);
	const p2Id = battleUserId(input.players.p2);
	if (p1Id) await upsertUser(db, input.players.p1);
	if (p2Id) await upsertUser(db, input.players.p2);
	const endedAt = input.endedAt ?? Date.now();
	const p1Win = input.winner === "p1" ? 1 : 0;
	const p2Win = input.winner === "p2" ? 1 : 0;
	const draw = input.winner === "draw" ? 1 : 0;
	const p1Loss = input.winner === "p2" ? 1 : 0;
	const p2Loss = input.winner === "p1" ? 1 : 0;

	const p1Result = input.winner === "p1" ? "win" : input.winner === "draw" ? "draw" : "loss";
	const p2Result = input.winner === "p2" ? "win" : input.winner === "draw" ? "draw" : "loss";
	const p1User = p1Id ? await getUserById(db, p1Id) : null;
	const p2User = p2Id ? await getUserById(db, p2Id) : null;
	const ranked = Boolean(p1User && p2User && p1Id !== p2Id);
	const elo = ranked
		? calculateElo({
				p1Elo: p1User!.elo,
				p2Elo: p2User!.elo,
				p1Battles: p1User!.battles,
				p2Battles: p2User!.battles,
				winner: input.winner,
				scoreP1: input.scoreP1,
				scoreP2: input.scoreP2,
			})
		: emptyElo(
				"Batalla no rankeada: ambos MCs deben entrar con cuenta para mover ELO.",
				p1User?.elo ?? null,
				p2User?.elo ?? null,
			);

	const statements: D1PreparedStatement[] = [
		db
			.prepare(
				`UPDATE battles
				 SET winner = ?, score_p1 = ?, score_p2 = ?, status = 'finished',
				     beat_id = ?, beat_name = ?, beat_audio_url = ?, beat_bpm = ?,
				     ended_at = ?
				 WHERE id = ?`,
			)
			.bind(
				input.winner,
				input.scoreP1,
				input.scoreP2,
				input.beat?.id ?? null,
				input.beat?.name ?? null,
				input.beat?.audioUrl ?? null,
				input.beat?.bpm ?? null,
				endedAt,
				input.id,
			),
		db
			.prepare(
				`INSERT INTO judgments (id, battle_id, winner, score_p1, score_p2, rationale, detail, model, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				input.id,
				input.winner,
				input.scoreP1,
				input.scoreP2,
				input.rationale,
				JSON.stringify({ detail: input.detail ?? null, elo }),
				input.model ?? "",
				endedAt,
			),
	];

	if (ranked && p1Id && p2Id) {
		statements.push(
			db
				.prepare(
					`UPDATE users
					 SET elo = ?,
					     battles = battles + 1,
					     wins = wins + ?,
					     draws = draws + ?,
					     losses = losses + ?,
					     current_streak = CASE WHEN ? = 'win' THEN current_streak + 1 ELSE 0 END,
					     best_streak = MAX(best_streak, CASE WHEN ? = 'win' THEN current_streak + 1 ELSE best_streak END),
					     last_battle_result = ?,
					     last_seen_at = ?
					 WHERE id = ?`,
				)
				.bind(elo.p1.after, p1Win, draw, p1Loss, p1Result, p1Result, p1Result, endedAt, p1Id),
			db
				.prepare(
					`UPDATE users
					 SET elo = ?,
					     battles = battles + 1,
					     wins = wins + ?,
					     draws = draws + ?,
					     losses = losses + ?,
					     current_streak = CASE WHEN ? = 'win' THEN current_streak + 1 ELSE 0 END,
					     best_streak = MAX(best_streak, CASE WHEN ? = 'win' THEN current_streak + 1 ELSE best_streak END),
					     last_battle_result = ?,
					     last_seen_at = ?
					 WHERE id = ?`,
				)
				.bind(elo.p2.after, p2Win, draw, p2Loss, p2Result, p2Result, p2Result, endedAt, p2Id),
			db
				.prepare(
					`INSERT INTO user_modality_stats (user_id, modality, battles, wins, draws, losses, total_score)
					 VALUES (?, ?, 1, ?, ?, ?, ?)
					 ON CONFLICT(user_id, modality) DO UPDATE SET
					   battles = battles + 1,
					   wins = wins + excluded.wins,
					   draws = draws + excluded.draws,
					   losses = losses + excluded.losses,
					   total_score = total_score + excluded.total_score`,
				)
				.bind(p1Id, input.modality, p1Win, draw, p1Loss, input.scoreP1),
			db
				.prepare(
					`INSERT INTO user_modality_stats (user_id, modality, battles, wins, draws, losses, total_score)
					 VALUES (?, ?, 1, ?, ?, ?, ?)
					 ON CONFLICT(user_id, modality) DO UPDATE SET
					   battles = battles + 1,
					   wins = wins + excluded.wins,
					   draws = draws + excluded.draws,
					   losses = losses + excluded.losses,
					   total_score = total_score + excluded.total_score`,
				)
				.bind(p2Id, input.modality, p2Win, draw, p2Loss, input.scoreP2),
		);
	}

	for (const role of ["p1", "p2"] as const) {
		input.verses[role].forEach((transcript, index) => {
			statements.push(
				db
					.prepare(
						`INSERT OR REPLACE INTO battle_turns (id, battle_id, role, round, transcript)
						 VALUES (?, ?, ?, ?, ?)`,
					)
					.bind(`${input.id}:${role}:${index + 1}`, input.id, role, index + 1, transcript),
			);
		});
	}

	await db.batch(statements);
	return elo;
}

export async function listRanking(db: D1Database, limit = 20): Promise<RankingRow[]> {
	const result = await db
		.prepare(
			`SELECT id, handle, elo, battles, wins, draws, losses,
				current_streak AS currentStreak, best_streak AS bestStreak
			 FROM users
			 WHERE battles > 0 AND is_guest = 0
			 ORDER BY elo DESC, wins DESC, battles ASC
			 LIMIT ?`,
		)
		.bind(limit)
		.all<RankingRow>();
	return result.results ?? [];
}

export async function listBattles(db: D1Database, limit = 20): Promise<BattleSummaryRow[]> {
	const result = await db
		.prepare(
			`SELECT
				id, modality, words,
				player1_id AS player1Id,
				player2_id AS player2Id,
				player1_name AS player1Name,
				player2_name AS player2Name,
				beat_id AS beatId,
				beat_name AS beatName,
				beat_audio_url AS beatAudioUrl,
				beat_bpm AS beatBpm,
				winner, score_p1 AS scoreP1, score_p2 AS scoreP2,
				status, started_at AS startedAt, ended_at AS endedAt
			 FROM battles
			 ORDER BY COALESCE(ended_at, started_at, 0) DESC
			 LIMIT ?`,
		)
		.bind(limit)
		.all<BattleSummaryRow>();
	return result.results ?? [];
}

export async function listUserBattles(db: D1Database, userId: string, limit = 30): Promise<BattleSummaryRow[]> {
	const result = await db
		.prepare(
			`SELECT
				id, modality, words,
				player1_id AS player1Id,
				player2_id AS player2Id,
				player1_name AS player1Name,
				player2_name AS player2Name,
				beat_id AS beatId,
				beat_name AS beatName,
				beat_audio_url AS beatAudioUrl,
				beat_bpm AS beatBpm,
				winner, score_p1 AS scoreP1, score_p2 AS scoreP2,
				status, started_at AS startedAt, ended_at AS endedAt
			 FROM battles
			 WHERE (player1_id = ? OR player2_id = ?) AND status = 'finished'
			 ORDER BY COALESCE(ended_at, started_at, 0) DESC
			 LIMIT ?`,
		)
		.bind(userId, userId, limit)
		.all<BattleSummaryRow>();
	return result.results ?? [];
}

export async function getModalityStats(db: D1Database, userId: string): Promise<ModalityStatRow[]> {
	const result = await db
		.prepare(
			`SELECT modality, battles, wins, draws, losses, total_score AS totalScore
			 FROM user_modality_stats
			 WHERE user_id = ?
			 ORDER BY battles DESC`,
		)
		.bind(userId)
		.all<ModalityStatRow>();
	return result.results ?? [];
}

export async function getProfile(db: D1Database, id: string): Promise<ProfileRow | null> {
	return db
		.prepare(
			`SELECT id, handle, email, avatar_url AS avatarUrl, is_guest AS isGuest,
				elo, battles, wins, draws, losses,
				current_streak AS currentStreak, best_streak AS bestStreak,
				last_battle_result AS lastBattleResult,
				created_at AS createdAt, last_seen_at AS lastSeenAt
			 FROM users
			 WHERE id = ? OR handle = ?
			 LIMIT 1`,
		)
		.bind(id, id)
		.first<ProfileRow>();
}
