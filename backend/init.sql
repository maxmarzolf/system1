-- ============================================================================
-- Score Attempts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS score_attempts (
    id SERIAL PRIMARY KEY,
    card_id VARCHAR(50) NOT NULL,
    card_title VARCHAR(255),
    question TEXT,
    options JSONB,
    correct_answer TEXT,
    user_answer TEXT,
    mode VARCHAR(50) NOT NULL CHECK (mode IN ('multiple-choice', 'full-solution', 'typing-race')),
    correct BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_score_attempts_card
    ON score_attempts(card_id);

CREATE INDEX IF NOT EXISTS idx_score_attempts_mode
    ON score_attempts(mode);

CREATE INDEX IF NOT EXISTS idx_score_attempts_correct
    ON score_attempts(correct);

CREATE INDEX IF NOT EXISTS idx_score_attempts_created
    ON score_attempts(created_at DESC);

-- ============================================================================
-- Flashcards Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS flashcards (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
    prompt TEXT NOT NULL,
    solution TEXT NOT NULL,
    missing TEXT NOT NULL,
    hint TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty
    ON flashcards(difficulty);

CREATE INDEX IF NOT EXISTS idx_flashcards_tags
    ON flashcards USING GIN(tags);

-- ============================================================================
-- Typing Sessions / Attempts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS typing_sessions (
    id SERIAL PRIMARY KEY,
    card_id VARCHAR(50) NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    card_title VARCHAR(255) NOT NULL,
    question_type VARCHAR(50) DEFAULT '',
    category_tags TEXT DEFAULT '',
    correct SMALLINT NOT NULL DEFAULT 0 CHECK (correct IN (0, 1)),
    accuracy REAL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    wpm INTEGER DEFAULT 0 CHECK (wpm >= 0),
    score INTEGER DEFAULT 0 CHECK (score >= 0),
    elapsed_ms INTEGER DEFAULT 0 CHECK (elapsed_ms >= 0),
    mistakes INTEGER DEFAULT 0 CHECK (mistakes >= 0),
    backspaces INTEGER DEFAULT 0 CHECK (backspaces >= 0),
    chars_typed INTEGER DEFAULT 0 CHECK (chars_typed >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_typing_sessions_date
    ON typing_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_typing_sessions_card
    ON typing_sessions(card_id);

CREATE INDEX IF NOT EXISTS idx_typing_sessions_correct
    ON typing_sessions(correct);

-- ============================================================================
-- Score Tracking Table (for aggregated stats)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_scores (
    id SERIAL PRIMARY KEY,
    score_date DATE NOT NULL,
    mode VARCHAR(50),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
    total_attempts INTEGER NOT NULL DEFAULT 0 CHECK (total_attempts >= 0),
    accuracy REAL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(score_date, mode)
);

CREATE INDEX IF NOT EXISTS idx_daily_scores_date
    ON daily_scores(score_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_scores_mode
    ON daily_scores(mode);

-- ============================================================================
-- Game Modes Reference Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_modes (
    id SERIAL PRIMARY KEY,
    mode_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO game_modes (mode_name, description) VALUES
    ('multiple-choice', 'Select the correct complete solution'),
    ('full-solution', 'Choose the correct complete solution from multiple options'),
    ('typing-race', 'Type the correct code to complete the solution')
ON CONFLICT (mode_name) DO NOTHING;
