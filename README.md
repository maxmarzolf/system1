# System1 Recall Trainer

## Features

- Main recall practice for pseudocode, skeleton, and full-answer templates
- Live coaching while typing, with final LLM-only submission feedback
- Readiness Overview by skill-map pattern and template mode
- Practice history with stored attempts, live feedback snapshots, and final feedback
- Skill-map drill generation backed by stored practice history

## Development

### Local Development

- Install dependencies: `npm install`
- Start frontend + backend: `npm run dev` (or `npm start`)
- Build for production: `npm run build`

Backend API runs on `http://localhost:3001` and persists data in PostgreSQL.

### Docker Deployment

The application can be deployed using Docker and Docker Compose with separate containers for the frontend, backend, and database.

**Prerequisites:**
- Docker and Docker Compose installed

**Quick Start:**
```bash
docker-compose up --build
```

This will:
- Build the frontend (React + Vite) container
- Build the backend (Python + FastAPI) container
- Start PostgreSQL, backend, and frontend services
- Expose the frontend on `http://localhost:5173`
- Expose the backend API on `http://localhost:3001`
- Share a common network for inter-service communication

**Service Details:**
- **Frontend**: Built with multi-stage Docker build, serves optimized production build with Node.js serve
- **Backend**: Python FastAPI server with Uvicorn
- **PostgreSQL**: Transactional database exposed on local port `5432`
- All services communicate over a shared Docker network
- PostgreSQL data is persisted under `backend/data/postgres`

**Database Configuration:**
PostgreSQL is available to the backend at `postgresql://flashcard_user:flashcard_password@postgres:5432/flashcard_db`. The backend automatically connects to PostgreSQL and stores score attempts with full details.

**Database Schema:**
- **score_attempts**: Stores recall attempts, answers, accuracy, timing, template mode, generated card metadata, live-coach usage, and final feedback
- **coach_feedback_events**: Stores live feedback events and final submission feedback events
- **generated_skill_map_cards**: Stores generated drills and generation context
- **patterns** and **methods**: Store the skill-map taxonomy

**API Endpoints:**
- `POST /api/attempts` - Save a main-recall attempt
- `GET /api/skill-map` - Load skill-map patterns and methods
- `GET /api/skill-map-overview` - Compute Readiness Overview
- `POST /api/coach/evaluate-attempt` - Score a submitted recall attempt
- `POST /api/coach/attempt-feedback` - Generate live or final coach feedback
- `POST /api/coach/history` - Load related practice history
- `POST /api/coach/session-plan` - Generate an end-of-session plan
- `POST /api/coach/skill-map-drills` - Generate and store focused drills

The backend uses FastAPI with `asyncpg` to connect to PostgreSQL.

**Stopping Services:**
```bash
docker-compose down
```

To remove the database volume:
```bash
docker-compose down -v
```

**Rebuilding After Code Changes:**
```bash
docker-compose up --build
```

### Database Initialization

Rebuild containers and initialize a fresh database:
```bash
docker compose down -v
docker compose up -d --build
```

The Postgres image loads scripts in this order:
- `backend/init-scripts/01-init.sql`
- `backend/init-scripts/05-data-patterns.sql`
- `backend/init-scripts/06-data-methods.sql`

### LLM Coach Feedback

The coach pipeline uses three distinct LLM roles, each with its own provider selection and token budget:

| Role | Purpose | Provider selection | Max tokens |
|------|---------|-------------------|------------|
| **Heuristic Assessor** | Structural assessment of each attempt (replaces ~1500 lines of rule-based heuristics) | Fastest available: Gemma → Claude → OpenAI | 600 |
| **Feedback Narrator** | Narrative coaching text for submission feedback | User-selected provider with fallback chain | 1800 |
| **Drill Generator** | Generates focused practice drills from skill-map history | User-selected provider with fallback chain | 2000 |

Live feedback (`liveMode=true`) uses only the Heuristic Assessor — no Narrator call.
Submission feedback (`liveMode=false`) runs Assessor → Narrator in sequence.

**Assessor output schema (v1):**
```json
{
  "v": 1,
  "patternIdentified": "sliding-window",
  "dimensions": {
    "structure":       { "score": 60, "note": "..." },
    "correctness":     { "score": 45, "note": "..." },
    "completeness":    { "score": 50, "note": "..." },
    "patternFidelity": { "score": 55, "note": "..." },
    "syntax":          { "valid": true, "error": null },
    "completionTime":  { "score": 70, "note": "..." }
  },
  "primaryBlocker": "...",
  "blockerKey": "...",
  "verdict": "needs-work",
  "errorTags": [...],
  "strengths": [...]
}
```

Backend provider settings:
- `COACH_LLM_PROVIDER` (default: `openai`; supported values: `openai`, `claude`, `gemma`)

OpenAI variables:
- `COACH_OPENAI_API_KEY` (preferred)
- `OPENAI_API_KEY` (also supported)
- `COACH_OPENAI_MODEL` (default: `gpt-5.2`)
- `COACH_OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)

Claude variables:
- `COACH_ANTHROPIC_API_KEY` (preferred)
- `ANTHROPIC_API_KEY` (also supported)
- `COACH_ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`)
- `COACH_ANTHROPIC_BASE_URL` (default: `https://api.anthropic.com/v1`)

Gemma (local) variables:
- `COACH_GEMMA_BASE_URL` (default: `http://localhost:11434/v1`)
- `COACH_GEMMA_MODEL` (default: `gemma3:1b`)

Local dev example (OpenAI):
```bash
cd backend
export COACH_LLM_PROVIDER="openai"
export OPENAI_API_KEY="your_key_here"
venv/bin/python main.py
```

Local dev example (Claude):
```bash
cd backend
export COACH_LLM_PROVIDER="claude"
export ANTHROPIC_API_KEY="your_key_here"
venv/bin/python main.py
```

Local dev example (Gemma via Ollama):
```bash
ollama serve  # in a separate terminal
cd backend
export COACH_LLM_PROVIDER="gemma"
venv/bin/python main.py
```

Practice-history reset example:
```bash
cd backend
export ADMIN_RESET_TOKEN="reset-practice-history"
venv/bin/python reset_practice_history.py
```

Docker Compose example (`backend/.env` is loaded by the backend service):
```bash
cat > backend/.env <<'EOF'
PORT=3001
DATABASE_URL=postgresql://flashcard_user:flashcard_password@postgres:5432/flashcard_db
ADMIN_RESET_TOKEN=reset-practice-history
COACH_LLM_PROVIDER=openai
COACH_OPENAI_API_KEY=your_key_here
COACH_OPENAI_MODEL=gpt-5.2
COACH_OPENAI_BASE_URL=https://api.openai.com/v1
COACH_ANTHROPIC_API_KEY=
COACH_ANTHROPIC_MODEL=claude-sonnet-4-6
COACH_ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
COACH_GEMMA_BASE_URL=http://localhost:11434/v1
COACH_GEMMA_MODEL=gemma3:1b
EOF

docker-compose up --build
```

Verification:
- API response from `POST /api/coach/attempt-feedback` includes `"llmUsed": true` when the LLM response is used.
- Live feedback returns a single Assessor call in server logs (no Narrator call).
- Submission feedback logs two sequential calls: Assessor then Narrator.
- During submit/revise, the Submission Feedback panel shows a waiting placeholder state and then renders pills/content only after the new response arrives.

### Submission Feedback Behavior

Submission feedback (`liveMode=false`) is LLM-only.

- No rule-based fallback is returned to users for submission grading/feedback.
- Backend retries LLM submission generation up to 3 times before failure.
- On failure, backend returns a structured error payload and frontend shows a modal with the provider-specific message.

Error payload shape for failed submission feedback requests:

```json
{
   "detail": {
      "code": "submission_feedback_no_response",
      "message": "Claude API error: insufficient credits. Add credits in your provider billing and try again.",
      "provider": "claude",
      "providerLabel": "Claude",
      "apiErrorCode": "provider_insufficient_credits"
   }
}
```

Common `apiErrorCode` values include:
- `provider_auth_error`
- `provider_insufficient_credits`
- `provider_rate_limited`
- `provider_model_error`
- `provider_network_error`
- `provider_timeout`

### Reset Practice History

To clear only generated practice history and coaching artifacts without touching seeded source data:

```bash
npm run reset:practice-history
```

This calls:
- `POST /api/admin/reset-practice-history`

It clears only:
- `score_attempts`
- `coach_feedback_events`
- `generated_skill_map_cards`

The request must include the confirmation token from `ADMIN_RESET_TOKEN`. By default the dev token is `reset-practice-history`.
