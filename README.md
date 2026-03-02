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

- Install dependencies: `npm install`
- Start frontend + backend: `npm run dev` (or `npm start`)
- Build for production: `npm run build`

Backend API runs on `http://localhost:3001` and persists score attempts in `backend/data/scores.json`.

## Data

Flashcards are defined in src/data/flashcards.ts. Add new cards by appending to the array.
