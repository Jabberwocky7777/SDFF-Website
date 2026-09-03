import { useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  invalid?: boolean
  /** Monospace + letter-spacing, for short codes. */
  mono?: boolean
  autoComplete?: string
  'aria-label'?: string
}

/** Text input that's masked by default, with an eye toggle to reveal. */
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  invalid,
  mono,
  autoComplete = 'off',
  ...rest
}: Props) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-label={rest['aria-label']}
        className={`w-full bg-background border rounded-lg px-3 py-2.5 pr-10 text-base text-text placeholder-muted/40 outline-none transition-colors ${
          mono ? 'font-mono tracking-[0.15em] placeholder:tracking-normal placeholder:font-sans' : 'font-sans'
        } ${invalid ? 'border-red-500/60 focus:border-red-400' : 'border-borderLow focus:border-border'}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide' : 'Show'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
