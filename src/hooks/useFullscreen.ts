import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Native fullscreen for one element, with a CSS fallback.
 *
 * Where the Fullscreen API exists we use it, so the board really does fill the
 * screen with no browser chrome. Where it doesn't (older WebKit, and anywhere
 * the request is rejected), `expanded` drives a `fixed inset-0` overlay instead
 * — the same effect minus hiding the browser UI. Callers just read `active`.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // The CSS fallback has no browser-provided exit, so wire up Escape ourselves.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])

  const active = native || expanded

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement === el) {
      void document.exitFullscreen()
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setExpanded(true))
    } else {
      setExpanded(true)
    }
  }, [expanded])

  return { ref, active, expanded, toggle }
}
