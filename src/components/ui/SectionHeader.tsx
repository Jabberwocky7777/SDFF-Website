interface Props {
  children: React.ReactNode
  className?: string
  eyebrow?: string
}

export default function SectionHeader({ children, className = '', eyebrow }: Props) {
  return (
    <div className={`mb-4 ${className}`}>
      {eyebrow && (
        <p className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-1.5">{eyebrow}</p>
      )}
      <h2 className="font-sans text-h2 font-bold text-text tracking-[-0.01em]">
        {children}
      </h2>
    </div>
  )
}
