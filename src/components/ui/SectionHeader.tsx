interface Props {
  children: React.ReactNode
  className?: string
}

export default function SectionHeader({ children, className = '' }: Props) {
  return (
    <h2 className={`font-sans text-gold text-xs uppercase tracking-widest font-semibold mb-4 ${className}`}>
      {children}
    </h2>
  )
}
