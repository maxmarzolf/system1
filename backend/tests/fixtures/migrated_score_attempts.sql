INSERT INTO multiple_choice_problem (
    id,
    user_id,
    question_text,
    question_help_text,
    recall_answer,
    multiple_choice_correct_answer_text,
    fingerprint,
    created_date,
    modified_date
)
VALUES (
    'mcq-fx-parity-q1',
    '0000',
    'Given a sorted array, return the first index whose value is >= target.',
    '',
    NULL,
    'Use binary search with left-bound checks.',
    'fx-parity-fingerprint-q1',
    '2026-05-24T00:00:00Z',
    '2026-05-24T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO submission (
    id,
    session_id,
    user_id,
    multiple_choice_problem_id,
    answer,
    question_type,
    category_tags,
    correct_answer,
    accuracy,
    signals,
    interaction_id,
    generated_card_id,
    generated_card,
    template_mode,
    support_layer,
    live_coach_used,
    migration_key,
    created_at,
    updated_at
)
VALUES (
    910001,
    'fx-parity-session-1',
    '0000',
    'mcq-fx-parity-q1',
    'while left <= right: ...',
    'skill-map',
    ARRAY['skill-map', 'binary-search', 'fx-parity-tag'],
    'Use binary search with left-bound checks.',
    100,
    '{"elapsed_ms":3200,"coach_feedback":{"diagnosis":"Great work"},"submission_rubric":{"verdict":"sound"}}'::jsonb,
    'fx-parity-interaction-1',
    'fx-parity-card-1',
    '{"id":"fx-parity-card-1","title":"Binary Search Boundary","cardMode":"recall"}'::jsonb,
    'algorithm',
    'none',
    TRUE,
    'fx-parity-migration-1',
    '2026-05-24T00:00:00Z',
    '2026-05-24T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
