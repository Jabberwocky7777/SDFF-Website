interface Props {
  children: React.ReactNode
  className?: string
}

const BRACKET = 'absolute text-gold/40 text-[10px] leading-none font-mono pointer-events-none'

export default function Card({ children, className = '' }: Props) {
  return (
    <div className={`relative bg-surface border border-gold/20 p-4 ${className}`}>
      <span className={`${BRACKET} top-1 left-1.5`}>┌</span>
      <span className={`${BRACKET} top-1 right-1.5`}>┐</span>
      <span className={`${BRACKET} bottom-1 left-1.5`}>└</span>
      <span className={`${BRACKET} bottom-1 right-1.5`}>┘</span>
      {children}
    </div>
  )
}
