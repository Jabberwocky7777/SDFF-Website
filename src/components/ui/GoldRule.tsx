interface Props {
  className?: string
}

export default function GoldRule({ className = '' }: Props) {
  return <hr className={`border-t border-gold/30 ${className}`} />
}
