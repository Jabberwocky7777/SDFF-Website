import { Outlet, useLocation } from 'react-router-dom'
import NavBar from './NavBar'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function RootLayout() {
  const location = useLocation()
  return (
    <div className="min-h-screen bg-background text-text flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-28 pb-16">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="border-t border-borderLow py-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-6 w-6 opacity-70" />
            <span className="text-small text-muted">Squad Dynasty FF — established 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
