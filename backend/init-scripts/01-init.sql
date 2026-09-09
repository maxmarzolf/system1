-- ============================================================================
-- Legacy Score Attempts Table
-- ============================================================================
-- score_attempts has been replaced by submission as the canonical attempt ledger.

-- ============================================================================
-- Multiple Choice Problem Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS multiple_choice_problem (
    id VARCHAR(80) PRIMARY KEY,
    user_id VARCHAR(80) NOT NULL DEFAULT '0000',
    question_text TEXT NOT NULL,
    question_help_text TEXT NOT NULL DEFAULT '',
    recall_answer TEXT,
    multiple_choice_answer_label_1 VARCHAR(1),
    multiple_choice_answer_text_1 TEXT,
    multiple_choice_answer_label_2 VARCHAR(1),
    multiple_choice_answer_text_2 TEXT,
    multiple_choice_answer_label_3 VARCHAR(1),
    multiple_choice_answer_text_3 TEXT,
    multiple_choice_answer_label_4 VARCHAR(1),
    multiple_choice_answer_text_4 TEXT,
    multiple_choice_correct_answer_label VARCHAR(1),
    multiple_choice_correct_answer_text TEXT,
    fingerprint VARCHAR(64) NOT NULL,
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_multiple_choice_problem_fingerprint
    ON multiple_choice_problem(fingerprint);

CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_user_id
    ON multiple_choice_problem(user_id);

CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_created_date
    ON multiple_choice_problem(created_date DESC);

-- ============================================================================
-- Submission Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS submission (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(80) NOT NULL DEFAULT '0000',
    user_id VARCHAR(80) NOT NULL DEFAULT '0000',
    multiple_choice_problem_id VARCHAR(80) REFERENCES multiple_choice_problem(id) ON DELETE SET NULL,
    answer TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    category_tags TEXT[] NOT NULL DEFAULT '{}',
    correct_answer TEXT,
    successful BOOLEAN NOT NULL DEFAULT FALSE,
    signals JSONB NOT NULL DEFAULT '{"elapsed_ms": 0}'::jsonb CONSTRAINT submission_signals_object_check CHECK (jsonb_typeof(signals) = 'object'),
    interaction_id VARCHAR(80),
    generated_card_id VARCHAR(80),
    problem_slug VARCHAR(120),
    generated_card JSONB,
    template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm' CHECK (template_mode IN ('algorithm')),
    support_layer VARCHAR(30) NOT NULL DEFAULT 'none' CHECK (support_layer IN ('none', 'ghost-reps')),
    live_coach_used BOOLEAN NOT NULL DEFAULT FALSE,
    activity_format VARCHAR(30),
    target_source VARCHAR(30),
    target_control VARCHAR(20),
    format_control VARCHAR(20),
    migration_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_multiple_choice_problem_id
    ON submission(multiple_choice_problem_id);

CREATE INDEX IF NOT EXISTS idx_submission_session_user
    ON submission(session_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_migration_key
    ON submission(migration_key)
    WHERE migration_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submission_created_at
    ON submission(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_question_type_created_at
    ON submission(question_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_generated_card_id
    ON submission(generated_card_id);

CREATE INDEX IF NOT EXISTS idx_submission_problem_slug_created_at
    ON submission(problem_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_interaction_id
    ON submission(interaction_id);

CREATE INDEX IF NOT EXISTS idx_submission_category_tags
    ON submission USING GIN(category_tags);

CREATE INDEX IF NOT EXISTS idx_submission_template_support_created_at
    ON submission(template_mode, support_layer, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_multiple_choice_problem_id_created_at
    ON submission(multiple_choice_problem_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_session_id_created_at
    ON submission(session_id, created_at DESC);

-- ============================================================================
-- Taxonomy: algorithm -> problem -> [skill, technique]
-- ============================================================================
CREATE TABLE IF NOT EXISTS algorithm (
    slug VARCHAR(80) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS technique (
    slug VARCHAR(80) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill (
    slug VARCHAR(120) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem (
    slug VARCHAR(120) PRIMARY KEY,
    algorithm_slug VARCHAR(80) NOT NULL REFERENCES algorithm(slug) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
    description TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL,
    source_type VARCHAR(40) NOT NULL DEFAULT 'core-catalog',
    question_type VARCHAR(50) NOT NULL DEFAULT 'skill-map',
    prompt TEXT NOT NULL DEFAULT '',
    missing TEXT NOT NULL DEFAULT '',
    hint TEXT NOT NULL DEFAULT '',
    llm_used BOOLEAN NOT NULL DEFAULT FALSE,
    generation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    leetcode_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problem_algorithm
    ON problem(algorithm_slug, display_order);

CREATE INDEX IF NOT EXISTS idx_problem_tags
    ON problem USING GIN(tags);

CREATE TABLE IF NOT EXISTS playlist (
    slug VARCHAR(120) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    show_on_skill_map BOOLEAN NOT NULL DEFAULT FALSE,
    static_deck BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_problem_order (
    playlist_slug VARCHAR(120) NOT NULL REFERENCES playlist(slug) ON DELETE CASCADE,
    order_slug VARCHAR(40) NOT NULL,
    problem_slug VARCHAR(120) NOT NULL REFERENCES problem(slug) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    tier VARCHAR(120),
    family VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (playlist_slug, order_slug, problem_slug),
    UNIQUE (playlist_slug, order_slug, position)
);

CREATE INDEX IF NOT EXISTS idx_playlist_problem_order_position
    ON playlist_problem_order(playlist_slug, order_slug, position);

CREATE TABLE IF NOT EXISTS problem_skill (
    problem_slug VARCHAR(120) NOT NULL REFERENCES problem(slug) ON DELETE CASCADE,
    skill_slug VARCHAR(120) NOT NULL REFERENCES skill(slug) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (problem_slug, skill_slug)
);

CREATE INDEX IF NOT EXISTS idx_problem_skill_skill
    ON problem_skill(skill_slug);

CREATE TABLE IF NOT EXISTS problem_technique (
    problem_slug VARCHAR(120) NOT NULL REFERENCES problem(slug) ON DELETE CASCADE,
    technique_slug VARCHAR(80) NOT NULL REFERENCES technique(slug) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (problem_slug, technique_slug)
);

CREATE INDEX IF NOT EXISTS idx_problem_technique_technique
    ON problem_technique(technique_slug);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'submission_problem_slug_fkey'
    ) THEN
        ALTER TABLE submission
            ADD CONSTRAINT submission_problem_slug_fkey
            FOREIGN KEY (problem_slug) REFERENCES problem(slug) ON DELETE RESTRICT;
    END IF;
END $$;
