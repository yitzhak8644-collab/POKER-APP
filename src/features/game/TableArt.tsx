import { SEAT_ANCHORS, TABLE_H, TABLE_W } from './seats'

/** Cup holder next to a seat: on the padded rail, facing the player. */
const cupHolder = (seat: number, x: number, y: number): { cx: number; cy: number } => {
  if (seat === 1) return { cx: 150, cy: 80 }
  if (seat === 6) return { cx: 150, cy: 480 }
  return { cx: x < 150 ? 88 : 212, cy: y }
}

/**
 * The table seen from above, drawn after our real one: a long "stadium" shape, black padded rail with
 * steel cup holders, a lavender felt band, a black centre with card slots, and a blue LED line.
 */
export function TableArt({ occupied, total }: { occupied: number; total: number }) {
  return (
    <svg
      viewBox={`0 0 ${TABLE_W} ${TABLE_H}`}
      aria-hidden="true"
      className="absolute inset-0 size-full"
      role="presentation"
    >
      <defs>
        <pattern id="felt" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill="#6a5f80" />
          <path d="M0 0H12M0 0V12" stroke="#7b7092" strokeWidth="1" />
        </pattern>
        <filter id="led" x="-20%" y="-10%" width="140%" height="120%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="steel" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f3f4f6" />
          <stop offset="1" stopColor="#6b7280" />
        </radialGradient>
      </defs>

      {/* padded rail */}
      <rect x="78" y="70" width="144" height="420" rx="72" fill="#14161c" stroke="#05060a" strokeWidth="3" />
      {/* lavender felt band */}
      <rect x="98" y="90" width="104" height="380" rx="52" fill="url(#felt)" />
      {/* blue LED line along the inside of the rail */}
      <rect x="96" y="88" width="108" height="384" rx="54" fill="none" stroke="#3b82f6" strokeWidth="2.5" filter="url(#led)" />
      {/* black playing area */}
      <rect x="118" y="108" width="64" height="344" rx="32" fill="#0a0a0f" />

      {/* community-card slots, like the printed ones on the real table */}
      {[200, 224, 300, 324].map((y) => (
        <rect key={y} x="132" y={y} width="36" height="16" rx="2" fill="none" stroke="#e5e7eb" strokeOpacity="0.55" strokeWidth="1.2" />
      ))}
      {/* a spade and a couple of chips as table art */}
      <path
        fill="#e5e7eb"
        fillOpacity="0.7"
        transform="translate(150 140) scale(0.09) translate(-256 -256)"
        d="M256 140C204 200 158 232 158 284c0 34 27 52 54 52 18 0 32-7 40-19l-8 64h24l-8-64c8 12 22 19 40 19 27 0 54-18 54-52 0-52-46-84-98-144z"
      />
      <circle cx="140" cy="420" r="11" fill="#1f2937" stroke="#e5e7eb" strokeOpacity="0.6" strokeDasharray="4 3" />
      <circle cx="158" cy="424" r="11" fill="#b8860b" stroke="#fde68a" strokeOpacity="0.7" strokeDasharray="4 3" />

      {/* seat counter in the middle of the table */}
      <text x="150" y="268" textAnchor="middle" fill="#a7f3d0" fontSize="15" fontWeight="600">
        {occupied}/{total}
      </text>
      <text x="150" y="286" textAnchor="middle" fill="#a7f3d0" fillOpacity="0.8" fontSize="10">
        תפוסים
      </text>

      {/* steel cup holders, one per seat */}
      {SEAT_ANCHORS.map(({ seat, x, y }) => {
        const { cx, cy } = cupHolder(seat, x, y)
        return (
          <g key={seat}>
            <circle cx={cx} cy={cy} r="9" fill="url(#steel)" stroke="#1f2937" strokeWidth="1" />
            <circle cx={cx} cy={cy} r="5.5" fill="#374151" />
          </g>
        )
      })}
    </svg>
  )
}
