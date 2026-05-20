interface Props {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-surface border border-borderLow p-5 rounded-lg ${className}`}>
      {children}
    </div>
  )
}
