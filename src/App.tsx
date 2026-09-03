import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LeaguesProvider, useLeagues } from '@/context/LeaguesContext'
import SplashScreen from '@/components/auth/SplashScreen'
import SetupScreen from '@/components/auth/SetupScreen'
import RootLayout from '@/components/layout/RootLayout'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
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
import HubLayout, { useHub } from '@/components/hub/HubLayout'
import HubHome from '@/pages/hub/HubHome'
import LeagueOverview from '@/pages/hub/LeagueOverview'
import HubStandings from '@/pages/hub/HubStandings'
import HubHistory from '@/pages/hub/HubHistory'
import HubMatchups from '@/pages/hub/HubMatchups'
import HubHeadToHead from '@/pages/hub/HubHeadToHead'
import HubHeadToHeadGame from '@/pages/hub/HubHeadToHeadGame'
import HubRecords from '@/pages/hub/HubRecords'
import HubPowerRankings from '@/pages/hub/HubPowerRankings'
import HubManagers from '@/pages/hub/HubManagers'
import HubManagerProfile from '@/pages/hub/HubManagerProfile'
import HubTrades from '@/pages/hub/HubTrades'
import HubTradeDetail from '@/pages/hub/HubTradeDetail'
import HubDrafts from '@/pages/hub/HubDrafts'

/** `/` → the last league viewed, else the first accessible one, else the picker
 *  (or setup, for a fresh admin with no leagues yet). */
function HomeGate() {
  const { hasLeagues, admin } = useAuth()
  const { leagues, lastLeague, loading } = useLeagues()
  if (loading) return <SkeletonLoader rows={4} />
  if (!hasLeagues && admin) return <Navigate to="/settings" replace />
  const target =
    lastLeague && leagues.some((l) => l.slug === lastLeague)
      ? lastLeague
      : leagues[0]?.slug
  return <Navigate to={target ? `/l/${target}` : '/l'} replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  return useAuth().admin ? <>{children}</> : <Navigate to="/" replace />
}

/** Gate a tab to dynasty leagues (SDFF content). Renders inside HubLayout's Outlet. */
function DynastyOnly({ children }: { children: React.ReactNode }) {
  const { meta, slug } = useHub()
  return meta.type === 'dynasty' ? <>{children}</> : <Navigate to={`/l/${slug}`} replace />
}

/** Any unmatched path under /l/:slug lands back on that league's overview. */
function LeagueCatchAll() {
  const { slug } = useHub()
  return <Navigate to={`/l/${slug}`} replace />
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
          <Route path="draft-board" element={<AdminOnly><DraftBoard /></AdminOnly>} />

          <Route path="l" element={<HubHome />} />
          <Route path="l/:slug" element={<HubLayout />}>
            <Route index element={<LeagueOverview />} />
            <Route path="standings" element={<HubStandings />} />
            <Route path="history" element={<HubHistory />} />
            <Route path="matchups" element={<HubMatchups />} />
            <Route path="head-to-head" element={<HubHeadToHead />} />
            <Route path="head-to-head/:userA/vs/:userB" element={<HubHeadToHeadGame />} />
            <Route path="records" element={<HubRecords />} />
            <Route path="power-rankings" element={<HubPowerRankings />} />
            <Route path="managers" element={<HubManagers />} />
            <Route path="managers/:userId" element={<HubManagerProfile />} />

            {/* Every league */}
            <Route path="trades" element={<HubTrades />} />
            <Route path="trades/:tradeId" element={<HubTradeDetail />} />
            <Route path="rosters" element={<Rosters />} />
            <Route path="rosters/:teamId" element={<TeamDetail />} />
            <Route path="draft" element={<HubDrafts />} />

            {/* Dynasty only */}
            <Route path="picks" element={<DynastyOnly><Picks /></DynastyOnly>} />
            <Route path="dues" element={<DynastyOnly><Dues /></DynastyOnly>} />
            <Route path="bylaws" element={<DynastyOnly><Bylaws /></DynastyOnly>} />
            <Route path="bylaws/scoring" element={<DynastyOnly><ScoringCalc /></DynastyOnly>} />
            <Route path="timeline" element={<DynastyOnly><Timeline /></DynastyOnly>} />
            <Route path="news" element={<DynastyOnly><Announcements /></DynastyOnly>} />
            <Route
              path="admin"
              element={<DynastyOnly><AdminOnly><Admin /></AdminOnly></DynastyOnly>}
            />

            {/* Unknown sub-path → back to the league overview */}
            <Route path="*" element={<LeagueCatchAll />} />
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
