import { CUP_HOLDERS, CX, R_RAIL, STRAIGHT, TABLE_H, TABLE_W, Y_TOP } from './seats'

/** A stadium-shaped rect inset from the outer edge of the rail. */
const stadium = (inset: number) => ({
  x: CX - R_RAIL + inset,
  y: Y_TOP - R_RAIL + inset,
  width: 2 * (R_RAIL - inset),
  height: STRAIGHT + 2 * (R_RAIL - inset),
  rx: R_RAIL - inset,
})

const MID_Y = Y_TOP + STRAIGHT / 2

/**
 * The table seen from above, drawn after our real one: a short "stadium" with a black padded rail and a
 * steel cup holder at every seat, a lavender felt band, a black centre with card slots, and a blue LED line.
 */
export function TableArt({ occupied, total }: { occupied: number; total: number }) {
  const black = stadium(40)
  return (
    <svg viewBox={`0 0 ${TABLE_W} ${TABLE_H}`} aria-hidden="true" className="absolute inset-0 size-full" role="presentation">
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
      <rect {...stadium(0)} fill="#14161c" stroke="#05060a" strokeWidth="3" />
      {/* lavender felt band */}
      <rect {...stadium(20)} fill="url(#felt)" />
      {/* blue LED line along the inside of the rail */}
      <rect {...stadium(18)} fill="none" stroke="#3b82f6" strokeWidth="2.5" filter="url(#led)" />
      {/* black playing area */}
      <rect {...black} fill="#0a0a0f" />

      {/* community-card slots, like the printed ones on the real table */}
      {[-52, -30, 22, 44].map((dy) => (
        <rect key={dy} x={CX - 18} y={MID_Y + dy} width="36" height="16" rx="2" fill="none" stroke="#e5e7eb" strokeOpacity="0.55" strokeWidth="1.2" />
      ))}
      {/* a spade and a couple of chips as table art */}
      <path
        fill="#e5e7eb"
        fillOpacity="0.7"
        transform={`translate(${CX} ${black.y + 22}) scale(0.075) translate(-256 -256)`}
        d="M256 140C204 200 158 232 158 284c0 34 27 52 54 52 18 0 32-7 40-19l-8 64h24l-8-64c8 12 22 19 40 19 27 0 54-18 54-52 0-52-46-84-98-144z"
      />
      <circle cx={CX - 10} cy={black.y + black.height - 24} r="10" fill="#1f2937" stroke="#e5e7eb" strokeOpacity="0.6" strokeDasharray="4 3" />
      <circle cx={CX + 8} cy={black.y + black.height - 20} r="10" fill="#b8860b" stroke="#fde68a" strokeOpacity="0.7" strokeDasharray="4 3" />

      {/* seat counter in the middle of the table */}
      <text x={CX} y={MID_Y + 2} textAnchor="middle" fill="#a7f3d0" fontSize="15" fontWeight="600">
        {occupied}/{total}
      </text>
      <text x={CX} y={MID_Y + 17} textAnchor="middle" fill="#a7f3d0" fillOpacity="0.8" fontSize="10">
        תפוסים
      </text>

      {/* steel cup holders, one per seat */}
      {CUP_HOLDERS.map(({ seat, x, y }) => (
        <g key={seat}>
          <circle cx={x} cy={y} r="9" fill="url(#steel)" stroke="#1f2937" strokeWidth="1" />
          <circle cx={x} cy={y} r="5.5" fill="#374151" />
        </g>
      ))}
    </svg>
  )
}
