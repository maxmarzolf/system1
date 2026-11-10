import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import './index.css'
import './App.css'
import App from './App.tsx'
import DashboardPage from './DashboardPage.tsx'
import PracticeHistoryPage from './PracticeHistoryPage.tsx'
import { ThemeProvider } from './theme.tsx'
import TunePage from './TunePage.tsx'
import AdminPage from './AdminPage.tsx'
import { queryClient } from '@/api/client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/tune" element={<TunePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/coach-tuning" element={<Navigate to="/tune" replace />} />
          <Route path="/submission-tuning" element={<Navigate to="/tune" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/practice-history" element={<PracticeHistoryPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
