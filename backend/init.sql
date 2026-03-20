-- ============================================================================
-- Score Attempts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS score_attempts (
    id SERIAL PRIMARY KEY,
    card_id VARCHAR(50) NOT NULL,
    card_title VARCHAR(255),
    question TEXT,
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    category_tags TEXT[] DEFAULT '{}',
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
    accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    exact BOOLEAN NOT NULL DEFAULT FALSE,
    elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
    interaction_id VARCHAR(80),
    generated_card_id VARCHAR(80),
    generated_card JSONB,
    coach_feedback JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_score_attempts_card
    ON score_attempts(card_id);

CREATE INDEX IF NOT EXISTS idx_score_attempts_mode
    ON score_attempts(mode);

CREATE INDEX IF NOT EXISTS idx_score_attempts_question_type
    ON score_attempts(question_type);

CREATE INDEX IF NOT EXISTS idx_score_attempts_category_tags
    ON score_attempts USING GIN(category_tags);

CREATE INDEX IF NOT EXISTS idx_score_attempts_correct
    ON score_attempts(correct);

CREATE INDEX IF NOT EXISTS idx_score_attempts_created
    ON score_attempts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_score_attempts_interaction_id
    ON score_attempts(interaction_id);

CREATE INDEX IF NOT EXISTS idx_score_attempts_generated_card_id
    ON score_attempts(generated_card_id);

-- ============================================================================
-- Generated Skill Map Cards
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_skill_map_cards (
    id VARCHAR(80) PRIMARY KEY,
    question_type VARCHAR(50) NOT NULL DEFAULT 'skill-map',
    title VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
    prompt TEXT NOT NULL,
    solution TEXT NOT NULL,
    missing TEXT NOT NULL,
    hint TEXT NOT NULL DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    llm_used BOOLEAN NOT NULL DEFAULT FALSE,
    generation_context JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_generated_skill_map_cards_created
    ON generated_skill_map_cards(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_skill_map_cards_tags
    ON generated_skill_map_cards USING GIN(tags);

-- ============================================================================
-- Coach Feedback Events Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_feedback_events (
    id SERIAL PRIMARY KEY,
    interaction_id VARCHAR(80),
    card_id VARCHAR(80) NOT NULL,
    generated_card_id VARCHAR(80),
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    feedback_stage VARCHAR(20) NOT NULL CHECK (feedback_stage IN ('live', 'submission')),
    draft_mode BOOLEAN NOT NULL DEFAULT FALSE,
    prompt TEXT,
    expected_answer TEXT,
    user_answer TEXT,
    accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    exact BOOLEAN NOT NULL DEFAULT FALSE,
    elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
    skill_tags TEXT[] DEFAULT '{}',
    previous_attempts JSONB,
    draft_milestones JSONB,
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    llm_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_interaction
    ON coach_feedback_events(interaction_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_card
    ON coach_feedback_events(card_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_generated_card
    ON coach_feedback_events(generated_card_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_stage_created
    ON coach_feedback_events(feedback_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_skill_tags
    ON coach_feedback_events USING GIN(skill_tags);

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

-- ============================================================================
-- Patterns Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS patterns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patterns_name
    ON patterns(name);

-- ============================================================================
-- Methods Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS methods (
    id SERIAL PRIMARY KEY,
    pattern_id INTEGER NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_methods_pattern
    ON methods(pattern_id);

CREATE INDEX IF NOT EXISTS idx_methods_name
    ON methods(name);
