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
    mode VARCHAR(50) NOT NULL CHECK (
        mode IN (
            'main-recall',
            'snap-classify',
            'template-hunt',
            'gut-check',
            'no-go-trap',
            'near-miss-duel',
            'multiple-choice',
            'full-solution',
            'typing-race'
        )
    ),
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
-- System1 Session Analytics Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS system1_sessions (
    id SERIAL PRIMARY KEY,
    mode VARCHAR(50) NOT NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('shuffled', 'original')),
    card_count INTEGER NOT NULL DEFAULT 0 CHECK (card_count >= 0),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    total_score INTEGER NOT NULL DEFAULT 0,
    avg_automaticity REAL NOT NULL DEFAULT 0 CHECK (avg_automaticity >= 0 AND avg_automaticity <= 100),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system1_sessions_completed
    ON system1_sessions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_system1_sessions_mode
    ON system1_sessions(mode);

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
    ('main-recall', 'Show full answer, hide it, then type from immediate recall'),
    ('snap-classify', 'Fast classification of patterns with strict timing'),
    ('template-hunt', 'Identify shared algorithmic structure across different forms'),
    ('gut-check', 'Rapid estimate plus confidence calibration with feedback'),
    ('no-go-trap', 'Go/No-Go inhibition challenge with near-miss distractors'),
    ('near-miss-duel', 'Choose between highly similar candidate solutions'),
    ('multiple-choice', 'Select the correct complete solution'),
    ('full-solution', 'Choose the correct complete solution from multiple options'),
    ('typing-race', 'Type the correct code to complete the solution')
ON CONFLICT (mode_name) DO NOTHING;

-- ============================================================================
-- Questions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    question_text TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
    leetcode_number INTEGER,
    mode VARCHAR(50),
    solution TEXT,
    hint_1 TEXT,
    hint_2 TEXT,
    hint_3 TEXT,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_archived
    ON questions(archived);

CREATE INDEX IF NOT EXISTS idx_questions_difficulty
    ON questions(difficulty);

CREATE INDEX IF NOT EXISTS idx_questions_mode
    ON questions(mode);

-- ============================================================================
-- Answers Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    answer_label VARCHAR(10),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_answers_question
    ON answers(question_id);

CREATE INDEX IF NOT EXISTS idx_answers_archived
    ON answers(archived);

CREATE INDEX IF NOT EXISTS idx_answers_correct
    ON answers(is_correct);

-- ============================================================================
-- Topics Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_topics_name
    ON topics(name);

CREATE INDEX IF NOT EXISTS idx_topics_archived
    ON topics(archived);

-- ============================================================================
-- Question Topics Junction Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS question_topics (
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_question_topics_question
    ON question_topics(question_id);

CREATE INDEX IF NOT EXISTS idx_question_topics_topic
    ON question_topics(topic_id);

-- ============================================================================
-- Submissions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    correct_answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    selected_answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_question
    ON submissions(question_id);

CREATE INDEX IF NOT EXISTS idx_submissions_correct
    ON submissions(is_correct);

CREATE INDEX IF NOT EXISTS idx_submissions_created
    ON submissions(created_at DESC);
