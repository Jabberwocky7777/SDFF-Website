import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'

export default function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-[#F6F0E2] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-24 pb-16">
        <Outlet />
      </main>
      <footer className="border-t border-gold/10 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-6 w-6 opacity-50" />
            <span className="font-sans text-[#52526A] text-xs uppercase tracking-widest">
              Squad Dynasty FF
            </span>
          </div>
          <div className="text-[#52526A] text-[10px] font-mono tracking-widest">
            · · · EST. 2026 · · ·
          </div>
        </div>
      </footer>
    </div>
  )
}
