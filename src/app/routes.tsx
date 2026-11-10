import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AdminPage from '@/features/admin/AdminPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import EvolvePage from '@/features/evolve/EvolvePage'
import JourneyPage from '@/features/journey/JourneyPage'
import PracticePage from '@/features/practice/PracticePage'
import TunePage from '@/features/tune/TunePage'
import PageSweep from './PageSweep'
import { usePageHotkeys } from './usePageHotkeys'

/** The old Journey URL; keep its query so existing links land on the same view. */
function LegacyJourneyRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search }} replace />
}

/** One route per feature; the retired tuning pages redirect to Tune. */
export default function AppRoutes() {
  usePageHotkeys()
  return (
    <>
      <Routes>
        <Route path="/" element={<JourneyPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tune" element={<TunePage />} />
        <Route path="/evolve" element={<EvolvePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/practice-history" element={<LegacyJourneyRedirect />} />
        <Route path="/coach-tuning" element={<Navigate to="/tune" replace />} />
        <Route path="/submission-tuning" element={<Navigate to="/tune" replace />} />
      </Routes>
      <PageSweep />
    </>
  )
}
