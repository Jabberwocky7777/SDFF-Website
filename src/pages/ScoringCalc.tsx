import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import GoldRule from '@/components/ui/GoldRule'

interface Stats {
  passYds: number; passTDs: number; ints: number; pick6s: number
  rushYds: number; rushTDs: number
  recYds: number; recTDs: number; receptions: number
  position: 'QB' | 'RB' | 'WR' | 'TE'
  has40yardPlay: boolean; has40yardTD: boolean
}

const DEFAULT: Stats = {
  passYds: 0, passTDs: 0, ints: 0, pick6s: 0,
  rushYds: 0, rushTDs: 0, recYds: 0, recTDs: 0, receptions: 0,
  position: 'WR', has40yardPlay: false, has40yardTD: false,
}

interface ScoreLine { label: string; value: number }

function calcScore(s: Stats): ScoreLine[] {
  const lines: ScoreLine[] = []
  if (s.passYds)     lines.push({ label: `Pass yards (${s.passYds} × 0.04)`,     value: s.passYds * 0.04 })
  if (s.passTDs)     lines.push({ label: `Pass TDs (${s.passTDs} × 6)`,           value: s.passTDs * 6 })
  if (s.ints)        lines.push({ label: `Interceptions (${s.ints} × −2)`,        value: s.ints * -2 })
  if (s.pick6s)      lines.push({ label: `Pick-6 penalty (${s.pick6s} × −1)`,    value: s.pick6s * -1 })
  if (s.rushYds)     lines.push({ label: `Rush yards (${s.rushYds} × 0.1)`,      value: s.rushYds * 0.1 })
  if (s.rushTDs)     lines.push({ label: `Rush TDs (${s.rushTDs} × 6)`,          value: s.rushTDs * 6 })
  if (s.recYds)      lines.push({ label: `Rec yards (${s.recYds} × 0.1)`,        value: s.recYds * 0.1 })
  if (s.recTDs)      lines.push({ label: `Rec TDs (${s.recTDs} × 6)`,            value: s.recTDs * 6 })
  if (s.receptions)  lines.push({ label: `Receptions base (${s.receptions} × 0.5)`, value: s.receptions * 0.5 })
  if (s.position === 'WR' && s.receptions)
    lines.push({ label: `WR bonus (${s.receptions} × 0.5)`,    value: s.receptions * 0.5 })
  if (s.position === 'TE' && s.receptions)
    lines.push({ label: `TE premium (${s.receptions} × 1.0)`,  value: s.receptions * 1.0 })
  if (s.has40yardPlay) lines.push({ label: '40+ yard play bonus', value: 1 })
  if (s.has40yardTD)   lines.push({ label: '40+ yard TD bonus',   value: 2 })
  return lines.filter((l) => l.value !== 0)
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-borderLow last:border-0">
      <label className="text-small text-muted font-sans">{label}</label>
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 bg-background border border-borderLow text-text font-mono text-base px-2 py-1.5 text-right rounded-lg focus:outline-none focus:border-border focus:ring-1 focus:ring-gold/20 transition-colors"
      />
    </div>
  )
}

export default function ScoringCalc() {
  const [stats, setStats] = useState<Stats>(DEFAULT)
  const set = <K extends keyof Stats>(key: K, val: Stats[K]) => setStats((s) => ({ ...s, [key]: val }))

  const lines = calcScore(stats)
  const total = lines.reduce((sum, l) => sum + l.value, 0)

  return (
    <div>
      <Link to="/bylaws" className="text-gold/70 text-small font-sans hover:text-gold transition-colors mb-5 inline-flex items-center gap-1">
        ← Rules & FAQs
      </Link>

      <div className="mb-8">
        <h1 className="font-sans text-h1 font-bold text-text mb-1">Scoring Calculator</h1>
        <p className="text-body text-muted">
          Enter any stat line to see the exact SDFF point total, including all bonus stacking.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Inputs */}
        <Card>
          {/* Position selector */}
          <div className="mb-4">
            <div className="text-label text-muted uppercase font-sans mb-2">Position</div>
            <div className="flex gap-2">
              {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => set('position', pos)}
                  className={`font-sans text-small px-3 py-1.5 border rounded-lg transition-all ${
                    stats.position === pos
                      ? 'border-gold bg-goldLow text-gold font-semibold'
                      : 'border-borderLow text-muted hover:border-border hover:text-text'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          <GoldRule className="mb-4" />

          {stats.position === 'QB' && (
            <>
              <NumInput label="Pass yards"               value={stats.passYds}  onChange={(v) => set('passYds', v)} />
              <NumInput label="Pass TDs"                 value={stats.passTDs}  onChange={(v) => set('passTDs', v)} />
              <NumInput label="Interceptions"            value={stats.ints}     onChange={(v) => set('ints', v)} />
              <NumInput label="Pick-6s (of those INTs)"  value={stats.pick6s}   onChange={(v) => set('pick6s', v)} />
            </>
          )}
          <NumInput label="Rush yards" value={stats.rushYds} onChange={(v) => set('rushYds', v)} />
          <NumInput label="Rush TDs"   value={stats.rushTDs} onChange={(v) => set('rushTDs', v)} />
          {stats.position !== 'QB' && (
            <>
              <NumInput label="Receptions"       value={stats.receptions} onChange={(v) => set('receptions', v)} />
              <NumInput label="Receiving yards"  value={stats.recYds}     onChange={(v) => set('recYds', v)} />
              <NumInput label="Receiving TDs"    value={stats.recTDs}     onChange={(v) => set('recTDs', v)} />
            </>
          )}

          <GoldRule className="my-4" />
          <div className="space-y-3">
            {[
              { key: 'has40yardPlay', label: 'Had a 40+ yard play (non-TD)' },
              { key: 'has40yardTD',   label: 'Had a 40+ yard TD' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={stats[key as keyof Stats] as boolean}
                  onChange={(e) => set(key as keyof Stats, e.target.checked as Stats[keyof Stats])}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-small text-muted font-sans group-hover:text-text transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </Card>

        {/* Output */}
        <div className="flex flex-col gap-4">
          <Card className="py-6 text-center">
            <div className="text-label text-muted uppercase font-sans mb-3">Total Score</div>
            <div className={`font-mono font-bold leading-none mb-2 ${
              total === 0 ? 'text-muted text-5xl' :
              total < 0  ? 'text-red-400 text-5xl' :
                           'text-text text-6xl'
            }`}>
              {total.toFixed(2)}
            </div>
            <div className="text-small text-muted font-sans">fantasy points</div>
          </Card>

          {lines.length > 0 && (
            <Card>
              <div className="text-label text-muted uppercase font-sans mb-3">Breakdown</div>
              <div>
                {lines.map((line) => (
                  <div key={line.label} className="flex justify-between items-center py-2 border-b border-borderLow last:border-0">
                    <span className="text-small text-muted font-sans">{line.label}</span>
                    <span className={`font-mono text-num tabular ${line.value >= 0 ? 'text-text' : 'text-red-400'}`}>
                      {line.value >= 0 ? '+' : ''}{line.value.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <GoldRule className="my-3" />
              <div className="flex justify-between items-center">
                <span className="text-label text-gold uppercase font-sans">Total</span>
                <span className={`font-mono text-num font-bold ${total >= 0 ? 'text-gold' : 'text-red-400'}`}>
                  {total.toFixed(2)}
                </span>
              </div>
            </Card>
          )}

          {lines.length === 0 && (
            <div className="bg-surface border border-borderLow rounded-lg p-6 text-center">
              <p className="text-base text-muted font-sans">Enter stats on the left to see your score.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
