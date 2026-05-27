import { timelineEvents } from '@/data/timeline'
import type { TimelineEvent } from '@/types/domain'

const TYPE_COLORS: Record<TimelineEvent['type'], { badge: string; dot: string; label: string }> = {
  draft:     { badge: 'bg-gold/20 text-gold border border-gold/30',                    dot: 'bg-gold',        label: 'Draft' },
  deadline:  { badge: 'bg-orange-900/30 text-orange-300 border border-orange-500/30',  dot: 'bg-orange-400',  label: 'Deadline' },
  season:    { badge: 'bg-blue-900/30 text-blue-300 border border-blue-500/30',        dot: 'bg-blue-400',    label: 'Season' },
  playoffs:  { badge: 'bg-purple-900/30 text-purple-300 border border-purple-500/30',  dot: 'bg-purple-400',  label: 'Playoffs' },
  offseason: { badge: 'bg-teal-900/30 text-teal-300 border border-teal-500/30',        dot: 'bg-teal-400',    label: 'Offseason' },
  waiver:    { badge: 'bg-zinc-800 text-zinc-300 border border-zinc-600/40',           dot: 'bg-zinc-400',    label: 'Waivers' },
}

function formatEventDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function isPast(iso: string): boolean {
  return new Date(iso + 'T23:59:59') < new Date()
}

const sorted = [...timelineEvents].sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
)

const firstUpcomingIndex = sorted.findIndex((e) => !isPast(e.date))

export default function Timeline() {
  return (
    <div>
      <div className="mb-10">
        <h1 className="font-sans text-hero font-bold text-text mb-2">League Timeline</h1>
        <p className="text-body text-muted leading-relaxed max-w-2xl">
          Key dates for the 2026 SDFF season and beyond. Past events are dimmed; the next upcoming event is highlighted.
        </p>
      </div>

      <div className="relative">
        {/* Vertical spine */}
        <div className="absolute left-[7.5rem] sm:left-[10rem] top-0 bottom-0 w-px bg-borderLow" aria-hidden="true" />

        <div className="space-y-0">
          {sorted.map((event, idx) => {
            const past = isPast(event.date)
            const isNextUp = idx === firstUpcomingIndex
            const colors = TYPE_COLORS[event.type]

            return (
              <div
                key={event.id}
                className={`relative flex transition-opacity ${past ? 'opacity-40' : 'opacity-100'}`}
              >
                {/* Date label — left column */}
                <div className="w-[7.5rem] sm:w-[10rem] shrink-0 pt-[1.15rem] pr-5 text-right">
                  <span className="font-mono text-label text-muted leading-none">
                    {formatEventDate(event.date)}
                  </span>
                </div>

                {/* Dot — sits on the spine */}
                <div className="relative shrink-0" style={{ width: 0 }}>
                  <div className={`absolute top-[1.15rem] -translate-x-1/2 w-3 h-3 rounded-full border-2 border-background z-10 ${
                    isNextUp && !past
                      ? 'bg-gold ring-2 ring-gold/40 ring-offset-1 ring-offset-background animate-pulse'
                      : colors.dot
                  }`} />
                </div>

                {/* Event card — right column */}
                <div className="flex-1 pl-7 pb-5 pt-3">
                  {isNextUp && (
                    <div className="text-label font-bold text-gold uppercase tracking-[0.06em] mb-1.5">
                      Next Up
                    </div>
                  )}

                  <div className={`bg-surface rounded-lg p-4 border ${
                    isNextUp && !past
                      ? 'border-l-2 border-l-gold border-gold/30'
                      : 'border-borderLow'
                  }`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-sans text-h3 font-semibold text-text mb-1 leading-snug">
                          {event.label}
                        </h3>
                        {event.description && (
                          <p className="text-base text-muted leading-relaxed">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 text-label font-semibold px-2.5 py-1 rounded-full whitespace-nowrap mt-0.5 ${colors.badge}`}>
                        {colors.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 bg-surface border border-borderLow rounded-lg p-5">
        <div className="text-label uppercase font-bold text-muted mb-3">Legend</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_COLORS) as TimelineEvent['type'][]).map((type) => (
            <span key={type} className={`text-label font-semibold px-2.5 py-1 rounded-full ${TYPE_COLORS[type].badge}`}>
              {TYPE_COLORS[type].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
