import { ACE_FAN_ANGLES, ACE_SUITS, COMMUNITY_SLOTS, SLOT_H, SLOT_W, type Suit } from './tableCards'
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

// Suit shapes in a 24x24 box (paths, not text, so they do not depend on any font).
const SUIT_PATH: Record<Suit, string> = {
  spade: 'M12 2C8 7 3 10 3 14.5c0 2.5 2 4 4 4 1.4 0 2.5-.5 3.2-1.5L9.5 22h5l-.7-5c.7 1 1.8 1.5 3.2 1.5 2 0 4-1.5 4-4C21 10 16 7 12 2z',
  heart: 'M12 21.5s-8.5-5.3-8.5-11.5A4.8 4.8 0 0112 7.2 4.8 4.8 0 0120.5 10c0 6.2-8.5 11.5-8.5 11.5z',
  diamond: 'M12 2l7.5 10L12 22 4.5 12z',
  club: 'M12 2.5a4.3 4.3 0 00-3.2 7.2A4.300 4.300 0 106.500 17.500c1.200 0 2.200-.400 3-1.100L8.800 22h6.400l-.700-5.600c.800.700 1.800 1.100 3 1.100a4.300 4.300 0 10-2.300-7.800A4.300 4.300 0 0012 2.500z',
}
const SUIT_COLOR: Record<Suit, string> = { spade: '#111827', club: '#111827', heart: '#dc2626', diamond: '#dc2626' }

/** One ace, drawn with its bottom centre at the origin so a rotation fans it out. */
function Ace({ suit, angle }: { suit: Suit; angle: number }) {
  const color = SUIT_COLOR[suit]
  return (
    <g transform={`rotate(${angle})`} data-ace={suit}>
      <rect x="-9" y="-26" width="18" height="26" rx="2" fill="#f8fafc" stroke="#9ca3af" strokeWidth="0.6" />
      <text x="-7.4" y="-19.6" fontSize="6.6" fontWeight="700" fill={color}>
        A
      </text>
      <path d={SUIT_PATH[suit]} fill={color} transform="translate(-5.2 -18.6) scale(0.43)" />
    </g>
  )
}

/** The four aces fanned out at one end of the table (the far end is the same fan turned round). */
function AceFan({ x, y, turned }: { x: number; y: number; turned?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turned ? 180 : 0})`}>
      {ACE_SUITS.map((suit, i) => (
        <Ace key={suit} suit={suit} angle={ACE_FAN_ANGLES[i] ?? 0} />
      ))}
    </g>
  )
}

/**
 * The table seen from above, drawn after our real one: a short "stadium" with a black padded rail and a
 * steel cup holder at every seat, a lavender felt band, a black centre with the four aces at both ends and
 * the five community-card slots (flop of three, turn, river), and a blue LED line.
 */
export function TableArt() {
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

      {/* four aces at each end */}
      <AceFan x={CX} y={black.y + 44} />
      <AceFan x={CX} y={black.y + black.height - 44} turned />

      {/* community cards: flop (3), turn, river */}
      {COMMUNITY_SLOTS.map(({ card, dy }) => (
        <rect
          key={dy}
          data-slot={card}
          x={CX - SLOT_W / 2}
          y={MID_Y + dy}
          width={SLOT_W}
          height={SLOT_H}
          rx="2"
          fill="none"
          stroke="#e5e7eb"
          strokeOpacity="0.6"
          strokeWidth="1.2"
        />
      ))}

      {/* steel cup holders, one per seat */}
      {CUP_HOLDERS.map(({ seat, x, y }) => (
        <g key={seat} data-cup={seat}>
          <circle cx={x} cy={y} r="9" fill="url(#steel)" stroke="#1f2937" strokeWidth="1" />
          <circle cx={x} cy={y} r="5.5" fill="#374151" />
        </g>
      ))}
    </svg>
  )
}
