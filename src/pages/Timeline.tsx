import GoldRule from '@/components/ui/GoldRule'
import { timelineEvents } from '@/data/timeline'

const TYPE_STYLES: Record<string, { badge: string; dot: string }> = {
  draft:    { badge: 'bg-gold/20 text-gold border border-gold/40',            dot: 'bg-gold' },
  deadline: { badge: 'bg-red-500/15 text-red-400 border border-red-500/30',   dot: 'bg-red-400' },
  playoffs: { badge: 'bg-blue-500/15 text-blue-300 border border-blue-500/30', dot: 'bg-blue-400' },
  offseason:{ badge: 'bg-surface border border-borderLow text-muted',          dot: 'bg-muted' },
  waiver:   { badge: 'bg-green-500/15 text-green-400 border border-green-500/30', dot: 'bg-green-400' },
  season:   { badge: 'bg-surface border border-gold/30 text-gold/80',          dot: 'bg-gold/60' },
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function isPast(iso: string): boolean {
  return new Date(iso + 'T23:59:59') < new Date()
}

export default function Timeline() {
  const nextIdx = timelineEvents.findIndex((e) => !isPast(e.date))

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-sans text-h1 font-bold text-text mb-1">League Calendar</h1>
        <p className="text-body text-muted">Key dates for the SDFF 2026 season.</p>
      </div>

      <div className="relative pl-0 sm:pl-36">
        {/* Vertical connector line */}
        <div className="hidden sm:block absolute left-[7.25rem] top-3 bottom-3 w-px bg-borderLow" />

        <div className="space-y-4">
          {timelineEvents.map((event, i) => {
            const past = isPast(event.date)
            const isNext = i === nextIdx
            const styles = TYPE_STYLES[event.type] ?? TYPE_STYLES.offseason

            return (
              <div key={event.id} className={`relative flex flex-col sm:flex-row gap-3 ${past ? 'opacity-35' : ''}`}>

                {/* Date label */}
                <div className="hidden sm:block absolute right-[calc(100%+1.75rem)] top-3.5 w-28 text-right">
                  <span className="text-small text-muted leading-none whitespace-nowrap">
                    {formatDate(event.date)}
                  </span>
                </div>

                {/* Dot on the line */}
                <div className="hidden sm:block absolute left-[-1.75rem] top-3.5 -translate-x-[3px]">
                  <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                    isNext
                      ? 'ring-2 ring-gold/40 ring-offset-1 ring-offset-background ' + styles.dot
                      : styles.dot
                  }`} />
                </div>

                {/* Mobile date */}
                <div className="sm:hidden text-small text-muted">
                  {formatDate(event.date)}
                </div>

                {/* Event card */}
                <div className={`flex-1 bg-surface border px-4 py-3 rounded-lg transition-all ${
                  isNext ? 'border-gold/50 shadow-[0_0_16px_rgba(224,181,68,0.08)]' : 'border-borderLow'
                }`}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`font-sans text-base font-semibold leading-snug ${past ? 'text-muted' : 'text-text'}`}>
                      {event.label}
                    </span>
                    <span className={`text-label px-1.5 py-0.5 rounded-sm uppercase tracking-[0.04em] shrink-0 ${styles.badge}`}>
                      {event.type}
                    </span>
                    {isNext && (
                      <span className="text-label px-1.5 py-0.5 rounded-sm uppercase font-bold bg-gold text-background shrink-0">
                        Next Up
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-small text-muted leading-relaxed mt-1.5">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <GoldRule className="mt-10 mb-4" />
      <p className="text-small text-muted">
        Rookie draft is scheduled one week after the NFL Draft concludes. Future season dates confirmed annually.
      </p>
    </div>
  )
}
