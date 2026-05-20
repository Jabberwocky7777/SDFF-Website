import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RootLayout from '@/components/layout/RootLayout'
import Dashboard from '@/pages/Dashboard'
import Standings from '@/pages/Standings'
import Rosters from '@/pages/Rosters'
import TeamDetail from '@/pages/TeamDetail'
import Timeline from '@/pages/Timeline'
import Bylaws from '@/pages/Bylaws'
import ScoringCalc from '@/pages/ScoringCalc'

export default function App() {
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
