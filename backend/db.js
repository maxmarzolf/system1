import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'data', 'flashcards.db')

const db = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')

// ─── Schema ───

db.exec(`
  CREATE TABLE IF NOT EXISTS typing_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    card_title TEXT NOT NULL DEFAULT '',
    question_type TEXT NOT NULL DEFAULT '',
    category_tags TEXT NOT NULL DEFAULT '',
    correct INTEGER NOT NULL DEFAULT 0,
    accuracy REAL NOT NULL DEFAULT 0,
    wpm INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    mistakes INTEGER NOT NULL DEFAULT 0,
    backspaces INTEGER NOT NULL DEFAULT 0,
    chars_typed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_typing_sessions_date
    ON typing_sessions(created_at);

  CREATE INDEX IF NOT EXISTS idx_typing_sessions_card
    ON typing_sessions(card_id);
`)

// ─── Queries ───

const insertSession = db.prepare(`
  INSERT INTO typing_sessions
    (card_id, card_title, question_type, category_tags, correct, accuracy, wpm, score, elapsed_ms, mistakes, backspaces, chars_typed, created_at)
  VALUES
    (@cardId, @cardTitle, @questionType, @categoryTags, @correct, @accuracy, @wpm, @score, @elapsedMs, @mistakes, @backspaces, @charsTyped, @createdAt)
`)

// Activity for the last N days (GitHub-style grid)
const activityQuery = db.prepare(`
  SELECT
    date(created_at) AS day,
    COUNT(*) AS sessions,
    SUM(elapsed_ms) AS total_ms,
    ROUND(AVG(accuracy), 1) AS avg_accuracy,
    ROUND(AVG(wpm), 1) AS avg_wpm,
    SUM(chars_typed) AS total_chars,
    SUM(correct) AS correct_count,
    GROUP_CONCAT(DISTINCT question_type) AS question_types,
    GROUP_CONCAT(DISTINCT category_tags) AS category_tags
  FROM typing_sessions
  WHERE created_at >= date('now', @offsetDays || ' days')
  GROUP BY day
  ORDER BY day ASC
`)

// Summary stats across all time
const summaryQuery = db.prepare(`
  SELECT
    COUNT(*) AS total_sessions,
    COALESCE(SUM(elapsed_ms), 0) AS total_ms,
    COALESCE(SUM(chars_typed), 0) AS total_chars,
    COALESCE(ROUND(AVG(accuracy), 1), 0) AS avg_accuracy,
    COALESCE(ROUND(AVG(wpm), 1), 0) AS avg_wpm,
    COALESCE(SUM(correct), 0) AS total_correct,
    COALESCE(MAX(score), 0) AS best_score,
    COALESCE(MAX(wpm), 0) AS best_wpm
  FROM typing_sessions
`)

// Recent sessions
const recentQuery = db.prepare(`
  SELECT
    id, card_id, card_title, question_type, category_tags,
    correct, accuracy, wpm, score, elapsed_ms, mistakes, backspaces, chars_typed, created_at
  FROM typing_sessions
  ORDER BY created_at DESC
  LIMIT @limit
`)

// Streak: count consecutive days with at least 1 session ending today (or yesterday)
const streakQuery = db.prepare(`
  WITH RECURSIVE days_with_sessions AS (
    SELECT DISTINCT date(created_at) AS day
    FROM typing_sessions
  ),
  streak AS (
    SELECT date('now') AS d, 
           CASE WHEN EXISTS (SELECT 1 FROM days_with_sessions WHERE day = date('now')) THEN 1 ELSE 0 END AS has_session
    UNION ALL
    SELECT date(d, '-1 day'),
           CASE WHEN EXISTS (SELECT 1 FROM days_with_sessions WHERE day = date(d, '-1 day')) THEN 1 ELSE 0 END
    FROM streak
    WHERE has_session = 1 AND d > date('now', '-365 days')
  )
  SELECT COUNT(*) - 1 AS streak_days
  FROM streak
  WHERE has_session = 1
`)

export function saveTypingSession(data) {
  const result = insertSession.run({
    cardId: data.cardId,
    cardTitle: data.cardTitle || '',
    questionType: data.questionType || '',
    categoryTags: data.categoryTags || '',
    correct: data.correct ? 1 : 0,
    accuracy: data.accuracy || 0,
    wpm: data.wpm || 0,
    score: data.score || 0,
    elapsedMs: data.elapsedMs || 0,
    mistakes: data.mistakes || 0,
    backspaces: data.backspaces || 0,
    charsTyped: data.charsTyped || 0,
    createdAt: data.createdAt || new Date().toISOString(),
  })
  return result.lastInsertRowid
}

export function getActivityGrid(days = 365) {
  const rows = activityQuery.all({ offsetDays: `-${days}` })
  return rows
}

export function getTypingSummary() {
  return summaryQuery.get()
}

export function getRecentSessions(limit = 15) {
  return recentQuery.all({ limit })
}

export function getCurrentStreak() {
  const result = streakQuery.get()
  return result?.streak_days ?? 0
}

export default db
