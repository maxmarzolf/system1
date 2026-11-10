import { Navigate, Route, Routes } from 'react-router-dom'
import AdminPage from '@/features/admin/AdminPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import JourneyPage from '@/features/journey/JourneyPage'
import PracticePage from '@/features/practice/PracticePage'
import TunePage from '@/features/tune/TunePage'

/** One route per feature; the retired tuning pages redirect to Tune. */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PracticePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/practice-history" element={<JourneyPage />} />
      <Route path="/tune" element={<TunePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/coach-tuning" element={<Navigate to="/tune" replace />} />
      <Route path="/submission-tuning" element={<Navigate to="/tune" replace />} />
    </Routes>
  )
}
