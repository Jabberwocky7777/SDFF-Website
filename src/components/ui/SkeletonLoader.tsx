interface Props {
  className?: string
  rows?: number
}

export default function SkeletonLoader({ className = '', rows = 3 }: Props) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 bg-surface border border-gold/10 rounded animate-pulse"
          style={{ opacity: 1 - i * 0.2 }}
        />
      ))}
    </div>
  )
}
