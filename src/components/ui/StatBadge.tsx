interface Props {
  children: React.ReactNode
  className?: string
}

export default function StatBadge({ children, className = '' }: Props) {
  return (
    <span
      className={`font-mono text-sm bg-surface border border-gold/20 px-2 py-0.5 rounded text-[#F6F0E2] ${className}`}
    >
      {children}
    </span>
  )
}
