const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const workspaceRoot = path.resolve(__dirname, '..')

function loadTsModule(relativePath) {
  const fullPath = path.join(workspaceRoot, relativePath)
  const source = fs.readFileSync(fullPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText

  const module = { exports: {} }
  const context = {
    module,
    exports: module.exports,
    require,
    __dirname: path.dirname(fullPath),
    __filename: fullPath,
    console,
    process,
  }

  vm.createContext(context)
  new vm.Script(transpiled, { filename: fullPath }).runInContext(context)
  return module.exports
}

function escapeSingleQuotes(value) {
  return String(value).replace(/'/g, "''")
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${escapeSingleQuotes(value)}'`
}

function sqlDollar(value) {
  if (value === null || value === undefined) return 'NULL'
  const text = String(value)
  if (!text.includes('$$')) return `$$${text}$$`
  return `$seed$${text}$seed$`
}

const { flashcards } = loadTsModule('src/data/flashcards.ts')
const { top150Flashcards } = loadTsModule('src/data/flashcards-top150.ts')
const { cardOptions } = loadTsModule('src/data/flashcard-options.ts')
const { top150CardOptions } = loadTsModule('src/data/flashcard-options-top150.ts')

const allFlashcards = [...flashcards, ...top150Flashcards]
const allOptions = { ...cardOptions, ...top150CardOptions }

const fullModeRows = []

for (const card of allFlashcards) {
  const options = allOptions[card.id] || []
  const correct = options.find((option) => option.correct)
  const incorrect = options.filter((option) => !option.correct)

  if (!correct || incorrect.length < 3) {
    continue
  }

  const selected = [correct, ...incorrect.slice(0, 3)]
  const answers = selected.map((option, index) => ({
    label: String.fromCharCode(97 + index),
    isCorrect: index === 0,
    answerText: card.solution.replace('{{missing}}', option.code),
  }))

  fullModeRows.push({
    id: card.id,
    prompt: card.prompt,
    difficulty: card.difficulty,
    hint: card.hint,
    tags: card.tags || [],
    answers,
  })
}

const fullTags = [...new Set(fullModeRows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b))

let sql = ''
sql += '-- Auto-generated: full-solution mode seed data from src/data/*.ts\n\n'
sql += 'BEGIN;\n\n'
sql += "DELETE FROM question_topics WHERE question_id IN (SELECT id FROM questions WHERE mode = 'full-solution');\n"
sql += "DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE mode = 'full-solution');\n"
sql += "DELETE FROM questions WHERE mode = 'full-solution';\n\n"

sql += 'INSERT INTO topics (name, description, archived, created_at) VALUES\n'
sql += fullTags
  .map((tag) => `(${sqlString(tag)}, ${sqlString(`Topic derived from full mode tag: ${tag}`)}, FALSE, CURRENT_TIMESTAMP)`)
  .join(',\n')
sql += '\nON CONFLICT (name) DO NOTHING;\n\n'

sql += 'INSERT INTO questions (question_text, difficulty, leetcode_number, mode, solution, hint_1, hint_2, hint_3, archived, created_at, updated_at) VALUES\n'
sql += fullModeRows
  .map((row) => `(${sqlDollar(row.prompt)}, ${sqlString(row.difficulty)}, ${Number.parseInt(row.id, 10)}, 'full-solution', NULL, ${sqlDollar(row.hint)}, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
  .join(',\n')
sql += ';\n\n'

sql += 'INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES\n'
const answerRows = []
for (const row of fullModeRows) {
  for (const answer of row.answers) {
    answerRows.push(`((SELECT q.id FROM questions q WHERE q.mode = 'full-solution' AND q.leetcode_number = ${Number.parseInt(row.id, 10)} AND q.question_text = ${sqlDollar(row.prompt)} ORDER BY q.id DESC LIMIT 1), ${sqlDollar(answer.answerText)}, ${sqlString(answer.label)}, ${answer.isCorrect ? 'TRUE' : 'FALSE'}, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
  }
}
sql += answerRows.join(',\n')
sql += ';\n\n'

sql += 'INSERT INTO question_topics (question_id, topic_id, created_at) VALUES\n'
const questionTopicRows = []
for (const row of fullModeRows) {
  for (const tag of row.tags) {
    questionTopicRows.push(`((SELECT q.id FROM questions q WHERE q.mode = 'full-solution' AND q.leetcode_number = ${Number.parseInt(row.id, 10)} AND q.question_text = ${sqlDollar(row.prompt)} ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = ${sqlString(tag)} LIMIT 1), CURRENT_TIMESTAMP)`)
  }
}
sql += questionTopicRows.join(',\n')
sql += '\nON CONFLICT DO NOTHING;\n\n'

sql += 'COMMIT;\n'

const outPath = path.join(__dirname, 'data_full.sql')
fs.writeFileSync(outPath, sql, 'utf8')

console.log(`Wrote ${outPath}`)
console.log(`questions=${fullModeRows.length}`)
console.log(`answers=${answerRows.length}`)
console.log(`topics=${fullTags.length}`)
