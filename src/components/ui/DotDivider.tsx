interface Props {
  className?: string
}

export default function DotDivider({ className = '' }: Props) {
  return (
    <div className={`text-gold/40 tracking-[0.5em] text-center text-xs my-4 ${className}`}>
      · · ·
    </div>
  )
}
