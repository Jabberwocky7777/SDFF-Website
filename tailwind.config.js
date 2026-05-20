/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#111214',
        surface:    '#1A1C22',
        surfaceHi:  '#22252D',
        text:       '#F4EFE2',
        muted:      '#C7C2B0',
        mutedLow:   '#8E8B82',
        gold:       '#E0B544',
        goldLow:    'rgba(224,181,68,0.16)',
        border:     'rgba(224,181,68,0.18)',
        borderLow:  'rgba(244,239,226,0.08)',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        'label': ['13px', { lineHeight: '1.3', letterSpacing: '0.04em' }],
        'small': ['14px', { lineHeight: '1.5' }],
        'base':  ['16px', { lineHeight: '1.55' }],
        'body':  ['17px', { lineHeight: '1.5' }],
        'h3':    ['18px', { lineHeight: '1.35', letterSpacing: '-0.005em' }],
        'h2':    ['22px', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'h1':    ['28px', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'hero':  ['40px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'num':   ['17px', { lineHeight: '1.2' }],
        'numLg': ['32px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
}
