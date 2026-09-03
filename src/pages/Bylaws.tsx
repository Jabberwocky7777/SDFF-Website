import { useState } from 'react'
import { Link } from 'react-router-dom'
import GoldRule from '@/components/ui/GoldRule'
import { bylawsSections } from '@/data/bylaws'
import { useLeagueSlug } from '@/context/LeagueScope'

function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-borderLow last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-4 flex items-start justify-between gap-4 group"
      >
        <span className="font-sans text-base text-text group-hover:text-text transition-colors leading-relaxed">
          {question}
        </span>
        <span
          className="text-gold shrink-0 text-lg leading-none mt-0.5 transition-transform duration-200"
          style={{ transform: open ? 'rotate(45deg)' : 'none' }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="pb-4 pr-8 text-base text-muted font-sans leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  )
}

export default function Bylaws() {
  const slug = useLeagueSlug()
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-sans text-h1 font-bold text-text mb-1">Rules & FAQs</h1>
        <p className="text-body text-muted">
          Common questions about SDFF scoring, roster rules, trading, and more.
        </p>
      </div>

      {/* Scoring calculator callout */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border border-borderLow rounded-lg mb-8">
        <div>
          <div className="text-base font-medium text-text">Scoring Calculator</div>
          <div className="text-small text-muted mt-0.5">
            Enter a stat line to see exact SDFF points with a full breakdown.
          </div>
        </div>
        <Link
          to={`/l/${slug}/bylaws/scoring`}
          className="shrink-0 text-gold text-small font-sans border border-border px-4 py-2 rounded-lg hover:bg-goldLow transition-colors ml-4"
        >
          Open →
        </Link>
      </div>

      <div className="space-y-8">
        {bylawsSections.map((section, i) => (
          <div key={section.id}>
            {i > 0 && <GoldRule className="mb-8" />}
            <h2 className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-3">
              {section.title}
            </h2>
            <div className="bg-surface border border-borderLow rounded-lg px-4">
              {section.items.map((item) => (
                <AccordionItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <GoldRule className="mt-10 mb-4" />
      <p className="text-small text-muted">
        These FAQs reflect the SDFF bylaws as ratified before the 2026 season.
        Rule changes require a 7/12 vote during the April 1 → Rookie Draft window.
      </p>
    </div>
  )
}
