ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_battle_result TEXT;

CREATE TABLE IF NOT EXISTS user_modality_stats (
	user_id TEXT NOT NULL REFERENCES users(id),
	modality TEXT NOT NULL,
	battles INTEGER NOT NULL DEFAULT 0,
	wins INTEGER NOT NULL DEFAULT 0,
	draws INTEGER NOT NULL DEFAULT 0,
	losses INTEGER NOT NULL DEFAULT 0,
	total_score REAL NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, modality)
);

CREATE INDEX IF NOT EXISTS idx_modality_stats_user ON user_modality_stats(user_id);
