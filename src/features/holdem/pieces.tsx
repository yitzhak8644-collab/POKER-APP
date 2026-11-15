import { useEffect, useState, type CSSProperties } from 'react'
import { CHIPS } from '../../lib/chips'
import { chipBreakdown, type Card } from '../../lib/holdem/engine'

const SUITS: Record<string, { glyph: string; red: boolean; name: string }> = {
  // U+FE0E keeps the suit a text glyph (some phones would draw an emoji otherwise)
  s: { glyph: '♠︎', red: false, name: 'עלה' },
  h: { glyph: '♥︎', red: true, name: 'לב' },
  d: { glyph: '♦︎', red: true, name: 'יהלום' },
  c: { glyph: '♣︎', red: false, name: 'תלתן' },
}
const NO_SUIT = { glyph: '?', red: false, name: '' }

const cardStyle = (width: number, delay: number): CSSProperties =>
  ({ '--w': `${width}px`, animationDelay: delay > 0 ? `${delay}ms` : undefined }) as CSSProperties

interface CardProps {
  card: Card
  width?: number
  dim?: boolean
  lift?: boolean
  /** Animate in (used for cards that just arrived). */
  deal?: boolean
  delay?: number
}

export function PlayingCard({ card, width = 34, dim = false, lift = false, deal = false, delay = 0 }: CardProps) {
  const rank = card.charAt(0) === 'T' ? '10' : card.charAt(0)
  const suit = SUITS[card.charAt(1)] ?? NO_SUIT
  const cls = ['hl-card', suit.red ? 'red' : '', dim ? 'dim' : '', lift ? 'lift' : '', deal ? 'hl-deal' : ''].filter(Boolean).join(' ')
  return (
    <span className={cls} style={cardStyle(width, delay)} role="img" aria-label={`${rank} ${suit.name}`}>
      <span className="ix">
        {rank}
        <i>{suit.glyph}</i>
      </span>
      <span className="pip">{suit.glyph}</span>
    </span>
  )
}

export function CardBack({ width = 34, deal = false, delay = 0 }: { width?: number; deal?: boolean; delay?: number }) {
  return <span className={`hl-card back ${deal ? 'hl-deal' : ''}`} style={cardStyle(width, delay)} aria-hidden="true" />
}

export function CardSlot({ width = 34 }: { width?: number }) {
  return <span className="hl-card slot" style={cardStyle(width, 0)} aria-hidden="true" />
}

const CHIP_COLOR = new Map<number, string>(CHIPS.map((c) => [c.value, c.color]))

/** A pile of chips in the table's own colours (red 5, green 10, blue 25, black 100, yellow 250). */
export function ChipPile({ amount }: { amount: number }) {
  const cols: number[][] = []
  for (const v of chipBreakdown(amount)) {
    const last = cols[cols.length - 1]
    if (last !== undefined && last[0] === v && last.length < 5) last.push(v)
    else cols.push([v])
  }
  return (
    <span className="hl-chips" aria-hidden="true">
      {cols.slice(0, 4).map((col, i) => (
        <span key={i} className="hl-chipcol">
          {col.map((v, k) => (
            <span key={k} className="hl-chip" style={{ '--c': CHIP_COLOR.get(v) ?? '#64748b' } as CSSProperties} />
          ))}
        </span>
      ))}
    </span>
  )
}

/** Milliseconds left until `target` (server time), refreshed a few times a second. */
export function useRemaining(target: number | null, offset: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (target === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [target])
  return target === null ? 0 : Math.max(0, target - (now + offset))
}

const R = 26
const CIRC = 2 * Math.PI * R

/** The countdown ring around the avatar of the player to act. */
export function TurnRing({ fraction }: { fraction: number }) {
  const color = fraction > 0.5 ? '#e2bf73' : fraction > 0.25 ? '#f59e0b' : '#f43f5e'
  return (
    <svg className="hl-ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(2,6,23,.7)" strokeWidth="4" />
      <circle
        cx="28"
        cy="28"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - Math.max(0, Math.min(1, fraction)))}
        style={{ transition: 'stroke-dashoffset .2s linear, stroke .3s' }}
      />
    </svg>
  )
}
