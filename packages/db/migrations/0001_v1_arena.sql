CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	handle TEXT NOT NULL UNIQUE,
	email TEXT UNIQUE,
	avatar_url TEXT,
	auth_provider TEXT NOT NULL DEFAULT 'guest',
	is_guest INTEGER NOT NULL DEFAULT 1,
	elo INTEGER NOT NULL DEFAULT 1000,
	battles INTEGER NOT NULL DEFAULT 0,
	wins INTEGER NOT NULL DEFAULT 0,
	draws INTEGER NOT NULL DEFAULT 0,
	losses INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
	last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS battles (
	id TEXT PRIMARY KEY,
	modality TEXT NOT NULL,
	words TEXT NOT NULL DEFAULT '[]',
	player1_id TEXT REFERENCES users(id),
	player2_id TEXT REFERENCES users(id),
	player1_session_id TEXT,
	player2_session_id TEXT,
	player1_name TEXT NOT NULL DEFAULT 'MC 1',
	player2_name TEXT NOT NULL DEFAULT 'MC 2',
	winner TEXT,
	score_p1 REAL,
	score_p2 REAL,
	status TEXT NOT NULL DEFAULT 'pending',
	started_at INTEGER,
	ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS battle_turns (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	role TEXT NOT NULL,
	round INTEGER NOT NULL,
	transcript TEXT NOT NULL DEFAULT '',
	audio_key TEXT
);

CREATE TABLE IF NOT EXISTS judgments (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	winner TEXT NOT NULL,
	score_p1 REAL NOT NULL,
	score_p2 REAL NOT NULL,
	rationale TEXT NOT NULL DEFAULT '',
	detail TEXT,
	model TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_battles_ended_at ON battles(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_player1 ON battles(player1_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_player2 ON battles(player2_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_turns_battle ON battle_turns(battle_id, round, role);
