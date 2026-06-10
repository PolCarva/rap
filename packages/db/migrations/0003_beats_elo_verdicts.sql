CREATE TABLE IF NOT EXISTS beats (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	producer TEXT,
	audio_url TEXT NOT NULL,
	bpm INTEGER,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_beats_active ON beats(is_active, updated_at DESC);

ALTER TABLE battles ADD COLUMN beat_id TEXT REFERENCES beats(id);
ALTER TABLE battles ADD COLUMN beat_name TEXT;
ALTER TABLE battles ADD COLUMN beat_audio_url TEXT;
ALTER TABLE battles ADD COLUMN beat_bpm INTEGER;
