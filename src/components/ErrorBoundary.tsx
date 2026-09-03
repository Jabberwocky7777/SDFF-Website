import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this value resets the boundary (e.g. pass the route key). */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render errors in a subtree so a single broken page shows a message
 * instead of a blank white screen. Wrap route outlets with it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="bg-surface border border-borderLow rounded-lg p-8 text-center">
        <h2 className="font-sans text-h3 font-bold text-text mb-2">Something went wrong here</h2>
        <p className="text-small text-muted mb-4">
          This page hit an error. Try again, or head back to your leagues.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-gold text-background font-semibold text-small px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <a href="/" className="text-small text-muted hover:text-gold transition-colors">
            Back to leagues
          </a>
        </div>
      </div>
    )
  }
}
