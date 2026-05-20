interface Props {
  avatarUrl: string | null
  teamName: string
  size?: number
}

export default function ShieldAvatar({ avatarUrl, teamName, size = 40 }: Props) {
  const initials = teamName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const clipId = `shield-${size}`

  return (
    <div
      className="shrink-0 relative"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40" className="absolute inset-0">
        <defs>
          <clipPath id={clipId}>
            <path d="M20 2 L36 9 L36 22 Q36 32 20 38 Q4 32 4 22 L4 9 Z" />
          </clipPath>
        </defs>
        <path
          d="M20 2 L36 9 L36 22 Q36 32 20 38 Q4 32 4 22 L4 9 Z"
          fill="#13162A"
          stroke="rgba(196,149,42,0.4)"
          strokeWidth="1"
        />
        {avatarUrl ? (
          <image
            href={avatarUrl}
            x="4" y="2" width="32" height="36"
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <text
            x="20" y="24"
            textAnchor="middle"
            fontSize="13"
            fontFamily="'Playfair Display', Georgia, serif"
            fontWeight="700"
            fill="#C4952A"
          >
            {initials}
          </text>
        )}
      </svg>
    </div>
  )
}
