import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db',
})

// Test connection on startup
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('PostgreSQL connection error:', err)
  } else {
    console.log('PostgreSQL connected successfully')
  }
})

/**
 * Save a score attempt to PostgreSQL
 */
export async function saveScoreAttempt(data) {
  const query = `
    INSERT INTO score_attempts 
      (card_id, card_title, question, options, correct_answer, user_answer, mode, correct, created_at)
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `
  
  const values = [
    data.cardId,
    data.cardTitle || null,
    data.question || null,
    data.options ? JSON.stringify(data.options) : null,
    data.correctAnswer || null,
    data.userAnswer || null,
    data.mode,
    data.correct,
    data.timestamp || new Date().toISOString(),
  ]

  try {
    const result = await pool.query(query, values)
    return result.rows[0].id
  } catch (error) {
    console.error('Error saving score attempt:', error)
    throw error
  }
}

/**
 * Get all score attempts
 */
export async function getScoreAttempts() {
  const query = `
    SELECT 
      id,
      card_id as "cardId",
      card_title as "cardTitle",
      question,
      options,
      correct_answer as "correctAnswer",
      user_answer as "userAnswer",
      mode,
      correct,
      created_at as "timestamp"
    FROM score_attempts
    ORDER BY created_at DESC
  `

  try {
    const result = await pool.query(query)
    return result.rows
  } catch (error) {
    console.error('Error fetching score attempts:', error)
    throw error
  }
}

/**
 * Get aggregated stats
 */
export async function getAggregatedStats() {
  const query = `
    SELECT 
      mode,
      COUNT(*) as attempts,
      SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) as incorrect,
      ROUND(AVG(CASE WHEN correct THEN 100 ELSE 0 END)) as accuracy
    FROM score_attempts
    GROUP BY mode
  `

  try {
    const result = await pool.query(query)
    return result.rows
  } catch (error) {
    console.error('Error fetching aggregated stats:', error)
    throw error
  }
}

/**
 * Get recent attempts
 */
export async function getRecentAttempts(limit = 10) {
  const query = `
    SELECT 
      id,
      card_id as "cardId",
      card_title as "cardTitle",
      question,
      options,
      correct_answer as "correctAnswer",
      user_answer as "userAnswer",
      mode,
      correct,
      created_at as "timestamp"
    FROM score_attempts
    ORDER BY created_at DESC
    LIMIT $1
  `

  try {
    const result = await pool.query(query, [limit])
    return result.rows
  } catch (error) {
    console.error('Error fetching recent attempts:', error)
    throw error
  }
}

export default pool
