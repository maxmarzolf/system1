import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import './index.css'
import './App.css'
import App from './App.tsx'
import DashboardPage from './DashboardPage.tsx'
import PracticeHistoryPage from './PracticeHistoryPage.tsx'
import { ThemeProvider } from './theme.tsx'
import TunePage from './TunePage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/tune" element={<TunePage />} />
          <Route path="/coach-tuning" element={<Navigate to="/tune" replace />} />
          <Route path="/submission-tuning" element={<Navigate to="/tune" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/practice-history" element={<PracticeHistoryPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
