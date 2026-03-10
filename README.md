# LeetCode Flashcard Game

Completion-style flashcards to practice key steps in common LeetCode tree problems. Each card shows a prompt and a solution with one important line missing.

## Features

- Completion game mode with answer checking
- Hint toggle and reveal option
- Full solution selection mode (choose the correct complete solution)
- Shuffle deck and navigation
- Backend score tracking for correct/incorrect attempts
- Progress dashboard with totals, per-mode accuracy, 14-day trend, and recent attempts
- Starter set of binary tree and BST problems

## Development

### Local Development

- Install dependencies: `npm install`
- Start frontend + backend: `npm run dev` (or `npm start`)
- Build for production: `npm run build`

Backend API runs on `http://localhost:3001` and persists data in PostgreSQL.

### Docker Deployment

The application can be deployed using Docker and Docker Compose with separate containers for the frontend and backend.

**Prerequisites:**
- Docker and Docker Compose installed

**Quick Start:**
```bash
docker-compose up --build
```

This will:
- Build the frontend (React + Vite) container
- Build the backend (Python + FastAPI) container
- Start both services simultaneously with the frontend dependent on the backend
- Expose the frontend on `http://localhost:5173`
- Expose the backend API on `http://localhost:3001`
- Share a common network for inter-service communication

**Service Details:**
- **Frontend**: Built with multi-stage Docker build, serves optimized production build with Node.js serve
- **Backend**: Python FastAPI server with uvicorn
- **PostgreSQL**: Transactional database (port 5432, not exposed externally - only accessible from backend via Docker network)
- **Adminer**: Database management UI at `http://localhost:8080` for querying PostgreSQL
- All services communicate over a shared Docker network
- PostgreSQL data persisted in `postgres_data` volume

**Accessing the Database:**
1. Open Adminer at `http://localhost:8080`
2. Login with:
   - **System**: PostgreSQL
   - **Server**: postgres
   - **Username**: flashcard_user
   - **Password**: flashcard_password
   - **Database**: flashcard_db

**Database Configuration:**
PostgreSQL is available to the backend at `postgresql://flashcard_user:flashcard_password@postgres:5432/flashcard_db`. The backend automatically connects to PostgreSQL and stores score attempts with full details.

**Database Schema:**
- **score_attempts**: Stores all game attempts with question, options, correct answer, user's answer, and timestamps
- **flashcards**: Reference table for flashcard definitions
- **typing_sessions**: Detailed typing practice session metrics
- **daily_scores**: Aggregated daily statistics
- **game_modes**: Game mode reference data

**API Endpoints:**
- `POST /api/attempts` - Save a score attempt with full details (question, options, answers)
- `GET /api/score-attempts?limit=100` - Retrieve recent score attempts from PostgreSQL
- `GET /api/stats` - Get aggregated statistics
- `GET /api/typing-activity` - Get typing practice activity data

The backend uses the `pg` (node-postgres) package to connect to PostgreSQL. All score attempts now include:
- Question text
- Available options (for multiple-choice/full-solution modes)
- Correct answer
- User's recorded answer
- Card metadata and timestamps

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

## Data

Flashcards are defined in src/data/flashcards.ts. Add new cards by appending to the array.
