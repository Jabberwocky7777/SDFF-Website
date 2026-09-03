import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth, useHasFullSite } from '@/context/AuthContext'
import { LeaguesProvider } from '@/context/LeaguesContext'
import SplashScreen from '@/components/auth/SplashScreen'
import SetupScreen from '@/components/auth/SetupScreen'
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
import AdminSettings from '@/pages/AdminSettings'
import Dues from '@/pages/Dues'
import Picks from '@/pages/Picks'
import DraftBoard from '@/pages/DraftBoard'
import DraftGrades from '@/pages/DraftGrades'
import HubLayout from '@/components/hub/HubLayout'
import HubHome from '@/pages/hub/HubHome'
import LeagueOverview from '@/pages/hub/LeagueOverview'
import HubStandings from '@/pages/hub/HubStandings'
import HubHistory from '@/pages/hub/HubHistory'
import HubHeadToHead from '@/pages/hub/HubHeadToHead'
import HubHeadToHeadGame from '@/pages/hub/HubHeadToHeadGame'
import HubRecords from '@/pages/hub/HubRecords'
import HubPowerRankings from '@/pages/hub/HubPowerRankings'
import HubManagers from '@/pages/hub/HubManagers'
import HubManagerProfile from '@/pages/hub/HubManagerProfile'

function HomeGate() {
  const { hasLeagues, admin } = useAuth()
  const fullSite = useHasFullSite()
  if (!hasLeagues) return <Navigate to={admin ? '/settings' : '/l'} replace />
  return fullSite ? <Dashboard /> : <Navigate to="/l" replace />
}

function SdffOnly({ children }: { children: React.ReactNode }) {
  return useHasFullSite() ? <>{children}</> : <Navigate to="/l" replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  return useAuth().admin ? <>{children}</> : <Navigate to="/" replace />
}

function StorageBanner() {
  const { ephemeralStorage } = useAuth()
  if (!ephemeralStorage) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-small font-medium px-4 py-2 text-center">
      ⚠ Storage isn't persistent — the <code>/app/cache</code> volume can't be written, so your
      password and leagues will be lost on restart. Fix the volume (an ixVolume mounted at{' '}
      <code>/app/cache</code>, not read-only) and restart.
    </div>
  )
}

function AppRoutes() {
  const { authed, checking, needsSetup } = useAuth()

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-gold/50 animate-pulse" />
      </div>
    )
  }

  if (needsSetup)
    return (
      <>
        <StorageBanner />
        <SetupScreen />
      </>
    )
  if (!authed)
    return (
      <>
        <StorageBanner />
        <SplashScreen />
      </>
    )

  return (
    <BrowserRouter>
      <StorageBanner />
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<HomeGate />} />

          <Route path="settings" element={<AdminOnly><AdminSettings /></AdminOnly>} />

          {/* Flagship dynasty pages */}
          <Route path="standings" element={<SdffOnly><Standings /></SdffOnly>} />
          <Route path="rosters" element={<SdffOnly><Rosters /></SdffOnly>} />
          <Route path="rosters/:teamId" element={<SdffOnly><TeamDetail /></SdffOnly>} />
          <Route path="timeline" element={<SdffOnly><Timeline /></SdffOnly>} />
          <Route path="bylaws" element={<SdffOnly><Bylaws /></SdffOnly>} />
          <Route path="bylaws/scoring" element={<SdffOnly><ScoringCalc /></SdffOnly>} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="admin" element={<SdffOnly><Admin /></SdffOnly>} />
          <Route path="dues" element={<SdffOnly><Dues /></SdffOnly>} />
          <Route path="picks" element={<SdffOnly><Picks /></SdffOnly>} />
          <Route path="draft" element={<SdffOnly><DraftBoard /></SdffOnly>} />
          <Route path="draft-grades" element={<SdffOnly><DraftGrades /></SdffOnly>} />

          {/* Multi-league hub */}
          <Route path="l" element={<HubHome />} />
          <Route path="l/:slug" element={<HubLayout />}>
            <Route index element={<LeagueOverview />} />
            <Route path="standings" element={<HubStandings />} />
            <Route path="history" element={<HubHistory />} />
            <Route path="head-to-head" element={<HubHeadToHead />} />
            <Route path="head-to-head/:userA/vs/:userB" element={<HubHeadToHeadGame />} />
            <Route path="records" element={<HubRecords />} />
            <Route path="power-rankings" element={<HubPowerRankings />} />
            <Route path="managers" element={<HubManagers />} />
            <Route path="managers/:userId" element={<HubManagerProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LeaguesProvider>
        <AppRoutes />
      </LeaguesProvider>
    </AuthProvider>
  )
}
