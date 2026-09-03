import type { ReactNode, RefObject } from 'react'

/**
 * The house frame for a wide table.
 *
 * Every hub table used to re-derive this surface/border/overflow combination,
 * which is why they drifted apart visually. One wrapper keeps them consistent
 * and centralises the two tricks the big grids need: `bleed` to escape the
 * shell's max-width, and `maxHeight` to scroll inside the frame (so sticky
 * headers pin against the frame rather than the page).
 */
export default function ScrollTable({
  children,
  bleed = false,
  maxHeight,
  className = '',
  frameRef,
}: {
  children: ReactNode
  bleed?: boolean
  /** Any CSS length. Set it to make the frame scroll vertically too. */
  maxHeight?: string
  className?: string
  frameRef?: RefObject<HTMLDivElement | null>
}) {
  const frame = (
    <div
      ref={frameRef}
      className={`bg-surface border border-borderLow rounded-lg overflow-auto ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  )

  if (!bleed) return frame
  // Padding matches the shell's, so a bled table lines up with the window edge
  // gutter instead of running into it. `w-fit` keeps the frame hugging the
  // table — a narrow grid in a viewport-wide panel reads as a rendering bug.
  return (
    <div className="bleed px-4 sm:px-6 lg:px-8 flex justify-center">
      <div className="w-fit max-w-full min-w-0">{frame}</div>
    </div>
  )
}
