import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import SplashScreen from '@/components/auth/SplashScreen'
import RootLayout from '@/components/layout/RootLayout'
import Dashboard from '@/pages/Dashboard'
import Standings from '@/pages/Standings'
import Rosters from '@/pages/Rosters'
import TeamDetail from '@/pages/TeamDetail'
import Timeline from '@/pages/Timeline'
import Bylaws from '@/pages/Bylaws'
import ScoringCalc from '@/pages/ScoringCalc'
import Announcements from '@/pages/Announcements'
import Admin from '@/pages/Admin'
import Dues from '@/pages/Dues'
import Picks from '@/pages/Picks'
import DraftBoard from '@/pages/DraftBoard'
import DraftGrades from '@/pages/DraftGrades'

function AppRoutes() {
  const { authed, checking } = useAuth()

  if (checking) {
    // Minimal loading state while we validate stored credentials
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-gold/50 animate-pulse" />
      </div>
    )
  }

  if (!authed) return <SplashScreen />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="standings" element={<Standings />} />
          <Route path="rosters" element={<Rosters />} />
          <Route path="rosters/:teamId" element={<TeamDetail />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="bylaws" element={<Bylaws />} />
          <Route path="bylaws/scoring" element={<ScoringCalc />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="admin" element={<Admin />} />
          <Route path="dues" element={<Dues />} />
          <Route path="picks" element={<Picks />} />
          <Route path="draft" element={<DraftBoard />} />
          <Route path="draft-grades" element={<DraftGrades />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
