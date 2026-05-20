import { useState } from 'react'
import { Link } from 'react-router-dom'
import GoldRule from '@/components/ui/GoldRule'
import { bylawsSections } from '@/data/bylaws'

function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gold/10 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-4 flex items-start justify-between gap-4 group"
      >
        <span className="font-sans text-sm text-[#C8C4B8] group-hover:text-[#F6F0E2] transition-colors leading-relaxed">
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
        <div className="pb-4 pr-8 text-muted text-sm font-sans leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  )
}

export default function Bylaws() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-[#F6F0E2] text-2xl font-bold mb-1">Rules & FAQs</h1>
        <p className="text-muted text-sm font-sans">
          Common questions about SDFF scoring, roster rules, trading, and more.
        </p>
      </div>

      {/* Scoring calculator callout */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border border-gold/25 rounded mb-8">
        <div>
          <div className="text-[#F6F0E2] text-sm font-sans font-medium">Scoring Calculator</div>
          <div className="text-muted text-xs font-sans mt-0.5">
            Enter a stat line to see exact SDFF points with a full breakdown.
          </div>
        </div>
        <Link
          to="/bylaws/scoring"
          className="shrink-0 text-gold text-xs font-sans border border-gold/40 px-4 py-2 rounded hover:bg-gold/10 transition-colors ml-4"
        >
          Open →
        </Link>
      </div>

      <div className="space-y-8">
        {bylawsSections.map((section, i) => (
          <div key={section.id}>
            {i > 0 && <GoldRule className="mb-8" />}
            <h2 className="font-sans text-gold text-[10px] uppercase tracking-widest font-semibold mb-3">
              {section.title}
            </h2>
            <div className="bg-surface border border-gold/15 rounded px-4">
              {section.items.map((item) => (
                <AccordionItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <GoldRule className="mt-10 mb-4" />
      <p className="text-muted text-xs font-sans">
        These FAQs reflect the SDFF bylaws as ratified before the 2026 season.
        Rule changes require a 7/12 vote during the April 1 → Rookie Draft window.
      </p>
    </div>
  )
}
