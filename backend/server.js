import express from 'express'
import cors from 'cors'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  saveTypingSession,
  getActivityGrid,
  getTypingSummary,
  getRecentSessions,
  getCurrentStreak,
} from './db.js'
import {
  saveScoreAttempt,
  getScoreAttempts,
  getRecentAttempts,
} from './db-postgres.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT) || 3001
const dataFile = path.join(__dirname, 'data', 'scores.json')
const validModes = new Set(['multiple-choice', 'full-solution', 'typing-race'])

app.use(cors())
app.use(express.json())

const ensureDataFile = async () => {
  await fs.mkdir(path.dirname(dataFile), { recursive: true })
  try {
    await fs.access(dataFile)
  } catch {
    await fs.writeFile(dataFile, '[]\n', 'utf-8')
  }
}

const readAttempts = async () => {
  await ensureDataFile()
  const raw = await fs.readFile(dataFile, 'utf-8')
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeAttempts = async (attempts) => {
  await fs.writeFile(dataFile, JSON.stringify(attempts, null, 2), 'utf-8')
}

const dayKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10)

const aggregateStats = (attempts) => {
  const totals = { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 }
  const byMode = {
    'multiple-choice': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'full-solution': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
    'typing-race': { correct: 0, incorrect: 0, attempts: 0, accuracy: 0 },
  }

  const byDayMap = new Map()

  for (const attempt of attempts) {
    const bucket = attempt.correct ? 'correct' : 'incorrect'
    totals[bucket] += 1
    totals.attempts += 1

    if (byMode[attempt.mode]) {
      byMode[attempt.mode][bucket] += 1
      byMode[attempt.mode].attempts += 1
    }

    const key = dayKey(attempt.timestamp)
    if (!byDayMap.has(key)) {
      byDayMap.set(key, { date: key, correct: 0, incorrect: 0, attempts: 0, accuracy: 0 })
    }

    const dayEntry = byDayMap.get(key)
    dayEntry[bucket] += 1
    dayEntry.attempts += 1
  }

  totals.accuracy = totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0

  for (const mode of Object.keys(byMode)) {
    const entry = byMode[mode]
    entry.accuracy = entry.attempts > 0 ? Math.round((entry.correct / entry.attempts) * 100) : 0
  }

  const byDay = Array.from(byDayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((entry) => ({
      ...entry,
      accuracy: entry.attempts > 0 ? Math.round((entry.correct / entry.attempts) * 100) : 0,
    }))

  const recent = attempts.slice(-10).reverse()

  return { totals, byMode, byDay, recent }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/stats', async (_req, res) => {
  const attempts = await readAttempts()
  res.json(aggregateStats(attempts))
})

app.post('/api/attempts', async (req, res) => {
  const { 
    cardId, 
    cardTitle,
    question,
    options,
    correctAnswer,
    userAnswer,
    mode, 
    correct 
  } = req.body ?? {}

  if (typeof cardId !== 'string' || !cardId.trim()) {
    return res.status(400).json({ error: 'cardId is required' })
  }

  if (typeof mode !== 'string' || !validModes.has(mode)) {
    return res.status(400).json({ error: 'mode must be a valid game mode' })
  }

  if (typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'correct must be boolean' })
  }

  try {
    // Save to PostgreSQL with full details
    await saveScoreAttempt({
      cardId,
      cardTitle,
      question,
      options,
      correctAnswer,
      userAnswer,
      mode,
      correct,
      timestamp: new Date().toISOString(),
    })

    // Also maintain legacy JSON file for backward compatibility
    const attempts = await readAttempts()
    attempts.push({
      cardId,
      mode,
      correct,
      timestamp: new Date().toISOString(),
    })
    await writeAttempts(attempts)

    return res.status(201).json({
      saved: true,
      stats: aggregateStats(attempts),
    })
  } catch (error) {
    console.error('Error saving attempt:', error)
    return res.status(500).json({ error: 'Failed to save attempt' })
  }
})

// ─── Typing Session Endpoints ───

app.post('/api/typing-sessions', (req, res) => {
  try {
    const {
      cardId, cardTitle, questionType, categoryTags,
      correct, accuracy, wpm, score,
      elapsedMs, mistakes, backspaces, charsTyped,
    } = req.body ?? {}

    if (typeof cardId !== 'string' || !cardId.trim()) {
      return res.status(400).json({ error: 'cardId is required' })
    }

    const id = saveTypingSession({
      cardId,
      cardTitle: cardTitle || '',
      questionType: questionType || '',
      categoryTags: categoryTags || '',
      correct: !!correct,
      accuracy: accuracy || 0,
      wpm: wpm || 0,
      score: score || 0,
      elapsedMs: elapsedMs || 0,
      mistakes: mistakes || 0,
      backspaces: backspaces || 0,
      charsTyped: charsTyped || 0,
      createdAt: new Date().toISOString(),
    })

    return res.status(201).json({ saved: true, sessionId: Number(id) })
  } catch (err) {
    console.error('Error saving typing session:', err)
    return res.status(500).json({ error: 'Failed to save typing session' })
  }
})

app.get('/api/typing-activity', (_req, res) => {
  try {
    const days = Number(_req.query.days) || 365
    const activity = getActivityGrid(days)
    const summary = getTypingSummary()
    const recent = getRecentSessions(15)
    const streak = getCurrentStreak()
    return res.json({ activity, summary, recent, streak })
  } catch (err) {
    console.error('Error fetching typing activity:', err)
    return res.status(500).json({ error: 'Failed to fetch typing activity' })
  }
})

app.get('/api/score-attempts', async (_req, res) => {
  try {
    const limit = Number(_req.query.limit) || 100
    const attempts = await getRecentAttempts(limit)
    return res.json({ attempts })
  } catch (err) {
    console.error('Error fetching score attempts:', err)
    return res.status(500).json({ error: 'Failed to fetch score attempts' })
  }
})

app.listen(port, async () => {
  await ensureDataFile()
  console.log(`Score backend running on http://localhost:${port}`)
})
