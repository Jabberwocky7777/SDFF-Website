import { Outlet, useLocation } from 'react-router-dom'
import NavBar from './NavBar'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function RootLayout() {
  const location = useLocation()
  return (
    <div className="min-h-screen bg-background text-text flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-shell w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 overflow-x-clip">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="border-t border-borderLow py-6">
        <div className="max-w-shell mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-6 w-6 opacity-70" />
            <span className="text-small text-muted">Squad Dynasty FF — established 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
