-- CFHoot Database Schema

-- Table for storing saved quizzes
CREATE TABLE IF NOT EXISTS quizzes (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	questions TEXT NOT NULL, -- JSON array of questions
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- Index for sorting by updated_at
CREATE INDEX IF NOT EXISTS idx_quizzes_updated_at ON quizzes(updated_at DESC);

-- Table for game PIN to game ID mappings
CREATE TABLE IF NOT EXISTS game_pins (
	pin TEXT PRIMARY KEY,
	game_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

-- Index for cleaning up expired PINs
CREATE INDEX IF NOT EXISTS idx_game_pins_expires_at ON game_pins(expires_at);
