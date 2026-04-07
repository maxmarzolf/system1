import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './App.css'
import App from './App.tsx'
import CoachTuningPage from './CoachTuningPage.tsx'
import DashboardPage from './DashboardPage.tsx'
import PracticeHistoryPage from './PracticeHistoryPage.tsx'
import SubmissionTuningPage from './SubmissionTuningPage.tsx'
import { ThemeProvider } from './theme.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/coach-tuning" element={<CoachTuningPage />} />
          <Route path="/submission-tuning" element={<SubmissionTuningPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/practice-history" element={<PracticeHistoryPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
