-- ============================================================================
-- Legacy Score Attempts Table
-- ============================================================================
-- score_attempts has been replaced by answer as the canonical attempt ledger.

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
-- Question Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS question (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_fingerprint
    ON question(fingerprint);

CREATE INDEX IF NOT EXISTS idx_question_user_id
    ON question(user_id);

CREATE INDEX IF NOT EXISTS idx_question_created_date
    ON question(created_date DESC);

-- ============================================================================
-- Answer Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS answer (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(80) NOT NULL DEFAULT '0000',
    user_id VARCHAR(80) NOT NULL DEFAULT '0000',
    question_id VARCHAR(80) NOT NULL REFERENCES question(id),
    answer TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    category_tags TEXT[] NOT NULL DEFAULT '{}',
    correct_answer TEXT,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    exact BOOLEAN NOT NULL DEFAULT FALSE,
    elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
    interaction_id VARCHAR(80),
    generated_card_id VARCHAR(80),
    generated_card JSONB,
    template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm' CHECK (template_mode IN ('algorithm')),
    support_layer VARCHAR(30) NOT NULL DEFAULT 'none' CHECK (support_layer IN ('none', 'ghost-reps')),
    live_coach_used BOOLEAN NOT NULL DEFAULT FALSE,
    coach_feedback JSONB,
    submission_rubric JSONB,
    activity_format VARCHAR(30),
    target_source VARCHAR(30),
    target_control VARCHAR(20),
    format_control VARCHAR(20),
    migration_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_question_id
    ON answer(question_id);

CREATE INDEX IF NOT EXISTS idx_answer_session_user
    ON answer(session_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_migration_key
    ON answer(migration_key)
    WHERE migration_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_answer_created_at
    ON answer(created_at DESC);

-- Format-specific response details remain linked to the shared answer event.
CREATE TABLE IF NOT EXISTS answer_mcq_detail (
    answer_id BIGINT PRIMARY KEY REFERENCES answer(id) ON DELETE CASCADE,
    selected_choice_label VARCHAR(10) NOT NULL,
    correct_choice_label VARCHAR(10) NOT NULL,
    reasoning TEXT,
    reasoning_quality REAL CHECK (reasoning_quality >= 0 AND reasoning_quality <= 1),
    reasoning_evaluation JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS answer_skill_evidence (
    id BIGSERIAL PRIMARY KEY,
    answer_id BIGINT NOT NULL REFERENCES answer(id) ON DELETE CASCADE,
    pattern_slug TEXT NOT NULL,
    skill_slug TEXT NOT NULL,
    evidence_score REAL NOT NULL CHECK (evidence_score >= 0 AND evidence_score <= 1),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence_source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_skill_evidence_skill
    ON answer_skill_evidence(pattern_slug, skill_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS skill_misconception_catalog (
    id BIGSERIAL PRIMARY KEY,
    pattern_slug TEXT NOT NULL,
    skill_slug TEXT NOT NULL,
    misconception_tag TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (pattern_slug, skill_slug, misconception_tag)
);

INSERT INTO skill_misconception_catalog
    (pattern_slug, skill_slug, misconception_tag, label, description)
VALUES
    ('dynamic-programming', 'state-definition', 'insufficient-state', 'Insufficient state', 'The state omits information needed to determine future decisions.'),
    ('dynamic-programming', 'state-definition', 'redundant-state', 'Redundant state', 'The state stores information already implied by other dimensions.'),
    ('dynamic-programming', 'state-definition', 'state-transition-confusion', 'State/transition confusion', 'The learner describes how state changes instead of what the state means.'),
    ('dynamic-programming', 'state-definition', 'unclear-dimensions', 'Unclear dimensions', 'One or more state dimensions do not have a precise meaning.'),
    ('dynamic-programming', 'state-definition', 'future-state-collision', 'Future state collision', 'One state merges subproblems that require different future decisions.')
ON CONFLICT (pattern_slug, skill_slug, misconception_tag) DO NOTHING;

CREATE TABLE IF NOT EXISTS answer_misconception (
    id BIGSERIAL PRIMARY KEY,
    answer_id BIGINT NOT NULL REFERENCES answer(id) ON DELETE CASCADE,
    skill_evidence_id BIGINT REFERENCES answer_skill_evidence(id) ON DELETE SET NULL,
    misconception_id BIGINT REFERENCES skill_misconception_catalog(id) ON DELETE SET NULL,
    pattern_slug TEXT NOT NULL,
    skill_slug TEXT NOT NULL,
    misconception_tag TEXT NOT NULL,
    evaluator_note TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    detected_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_misconception_signal
    ON answer_misconception(pattern_slug, skill_slug, misconception_tag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_answer_question_type_created_at
    ON answer(question_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_answer_generated_card_id
    ON answer(generated_card_id);

CREATE INDEX IF NOT EXISTS idx_answer_interaction_id
    ON answer(interaction_id);

CREATE INDEX IF NOT EXISTS idx_answer_category_tags
    ON answer USING GIN(category_tags);

CREATE INDEX IF NOT EXISTS idx_answer_template_support_created_at
    ON answer(template_mode, support_layer, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_answer_question_id_created_at
    ON answer(question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_answer_session_id_created_at
    ON answer(session_id, created_at DESC);

-- ============================================================================
-- Core Algorithm Bank
-- ============================================================================
CREATE TABLE IF NOT EXISTS core_algorithm_patterns (
    pattern_slug VARCHAR(80) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS core_algorithm_methods (
    pattern_slug VARCHAR(80) NOT NULL REFERENCES core_algorithm_patterns(pattern_slug) ON DELETE CASCADE,
    method_slug VARCHAR(120) NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pattern_slug, method_slug)
);

CREATE TABLE IF NOT EXISTS core_algorithms (
    name VARCHAR(120) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
    description TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    leetcode_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS core_algorithm_skill_map (
    function_name VARCHAR(120) NOT NULL REFERENCES core_algorithms(name) ON DELETE CASCADE,
    pattern_slug VARCHAR(80) NOT NULL REFERENCES core_algorithm_patterns(pattern_slug) ON DELETE CASCADE,
    method_slug VARCHAR(120) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (function_name, pattern_slug, method_slug)
);

CREATE INDEX IF NOT EXISTS idx_core_algorithm_skill_map_pattern
    ON core_algorithm_skill_map(pattern_slug, display_order);

CREATE INDEX IF NOT EXISTS idx_core_algorithms_tags
    ON core_algorithms USING GIN(tags);

-- ============================================================================
-- Coach Feedback Events Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_feedback_events (
    id SERIAL PRIMARY KEY,
    interaction_id VARCHAR(80),
    card_id VARCHAR(80) NOT NULL,
    answer_id BIGINT REFERENCES answer(id) ON DELETE SET NULL,
    generated_card_id VARCHAR(80),
    question_type VARCHAR(50) NOT NULL DEFAULT '',
    feedback_stage VARCHAR(20) NOT NULL CHECK (feedback_stage IN ('live', 'submission')),
    live_mode BOOLEAN NOT NULL DEFAULT FALSE,
    prompt TEXT,
    expected_answer TEXT,
    user_answer TEXT,
    accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
    exact BOOLEAN NOT NULL DEFAULT FALSE,
    elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
    skill_tags TEXT[] DEFAULT '{}',
    previous_attempts JSONB,
    live_milestones JSONB,
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    llm_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_interaction
    ON coach_feedback_events(interaction_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_card
    ON coach_feedback_events(card_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_generated_card
    ON coach_feedback_events(generated_card_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_answer_id
    ON coach_feedback_events(answer_id);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_stage_created
    ON coach_feedback_events(feedback_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_skill_tags
    ON coach_feedback_events USING GIN(skill_tags);

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
