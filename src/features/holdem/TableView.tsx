import type { CSSProperties } from 'react'
import { seatIndexOf, type Card, type PublicSeat, type PublicState } from '../../lib/holdem/engine'
import { CardBack, CardSlot, ChipPile, PlayingCard, TurnRing, useRemaining } from './pieces'

/** Avatar centres, in % of the table area. Slot 0 is the viewer (bottom), then clockwise. */
const SEAT_POS: readonly [number, number][] = [
  [50, 84],
  [19, 76],
  [11, 55.5],
  [11, 35],
  [19, 14.5],
  [50, 8],
  [81, 14.5],
  [89, 35],
  [89, 55.5],
  [81, 76],
]
/** Where each seat's bet lies on the felt. */
const BET_POS: readonly [number, number][] = [
  [50, 60.5],
  [33, 67],
  [27, 57],
  [27, 37.5],
  [33, 24.5],
  [50, 24],
  [67, 24.5],
  [73, 37.5],
  [73, 57],
  [67, 67],
]

const LAST: Record<string, string> = {
  fold: 'פולד',
  check: 'צ׳ק',
  call: 'קול',
  bet: 'הימור',
  raise: 'רייז',
  allin: 'אול-אין',
  sb: 'SB',
  bb: 'BB',
}

const AVATAR_BG = ['#059669', '#0284c7', '#7c3aed', '#d97706', '#e11d48', '#0d9488']

const at = (pos: readonly [number, number][], slot: number): CSSProperties => {
  const p = pos[slot] ?? [50, 50]
  return { left: `${p[0]}%`, top: `${p[1]}%` }
}

interface Props {
  pub: PublicState
  me: string
  /** My own two cards, when I am in the hand. */
  cards: Card[] | null
  offset: number
  /** Present when the viewer may take an empty seat. */
  onSit?: (seat: number) => void
}

export function TableView({ pub, me, cards, offset, onSit }: Props) {
  const n = pub.seats.length
  const mySeat = seatIndexOf(pub, me)
  const rot = mySeat >= 0 ? mySeat : 0
  const slotOf = (i: number): number => (i - rot + n) % n
  const h = pub.hand
  const result = h?.result ?? null
  const streetBets = pub.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0)
  const centerPot = h !== null && result === null ? h.pot - streetBets : 0

  // At a showdown the five cards that won are lifted and the rest are dimmed.
  const playing = new Set<Card>()
  const mainWinners = result?.showdown ? (result.pots[0]?.winners ?? []) : []
  for (const w of mainWinners) for (const c of result?.best[String(w)] ?? []) playing.add(c)
  const marks = (c: Card, owner: number | null): { dim: boolean; lift: boolean } => {
    if (playing.size === 0) return { dim: false, lift: false }
    const counts = owner === null || mainWinners.includes(owner)
    return { dim: !(counts && playing.has(c)), lift: counts && playing.has(c) }
  }

  let banner: string | null = null
  if (result !== null) {
    const ids = Object.keys(result.won).map(Number)
    const first = ids[0]
    if (ids.length === 1 && first !== undefined) {
      const amount = result.won[String(first)] ?? 0
      const label = result.showdown ? result.labels[String(first)] : undefined
      const who = first === mySeat ? 'זכית' : `${pub.seats[first]?.name ?? ''} זכה`
      banner = `${who} ב-${amount}${label ? ` · ${label}` : ''}`
    } else if (ids.length > 1) {
      banner = `הקופה חולקה: ${ids.map((i) => pub.seats[i]?.name ?? '').join(', ')}`
    }
  }

  const myPub = mySeat >= 0 ? pub.seats[mySeat] : null
  const myFolded = myPub?.folded === true

  return (
    <div className="relative h-full w-full" dir="ltr">
      <div className="hl-rail">
        <div className="hl-felt" />
      </div>
      <div className="hl-mark">P שלוחות</div>

      {/* pot and board */}
      <div className="hl-pos hl-pot flex flex-col items-center gap-1" style={{ left: '50%', top: '33.5%', zIndex: 2 }}>
        {banner !== null ? (
          <div className="hl-banner" dir="rtl">
            {banner}
          </div>
        ) : (
          h !== null &&
          h.pot > 0 && (
            <>
              {centerPot > 0 && <ChipPile amount={centerPot} />}
              <span className="hl-amount" dir="rtl">
                קופה {h.pot}
              </span>
            </>
          )
        )}
      </div>
      <div className="hl-pos flex gap-[3px]" style={{ left: '50%', top: '46.5%', zIndex: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const c = h?.board[i]
          if (c === undefined) return <CardSlot key={`slot${i}`} width={36} />
          return <PlayingCard key={c} card={c} width={36} deal delay={i < 3 ? i * 110 : 0} {...marks(c, null)} />
        })}
      </div>

      {/* bets on the felt */}
      {pub.seats.map((s, i) =>
        s !== null && s.bet > 0 ? (
          <div key={`bet${i}`} className="hl-pos hl-bet" style={at(BET_POS, slotOf(i))}>
            <ChipPile amount={s.bet} />
            <span className="hl-amount">{s.bet}</span>
          </div>
        ) : null,
      )}

      {/* seats */}
      {pub.seats.map((s, i) => {
        const slot = slotOf(i)
        if (s === null) {
          return (
            <div key={`seat${i}`} className="hl-pos hl-seat" style={at(SEAT_POS, slot)}>
              {onSit ? (
                <button type="button" className="hl-empty" onClick={() => onSit(i)} aria-label={`לשבת בכיסא ${i + 1}`}>
                  +
                </button>
              ) : (
                <span className="hl-empty" style={{ opacity: 0.35 }} />
              )}
              {onSit && (
                <span className="hl-tag" dir="rtl">
                  שב כאן
                </span>
              )}
            </div>
          )
        }
        return (
          <SeatView
            key={`seat${i}`}
            pub={pub}
            seat={s}
            index={i}
            isMe={i === mySeat}
            offset={offset}
            style={at(SEAT_POS, slot)}
            marks={marks}
          />
        )
      })}

      {/* my own cards, large */}
      {cards !== null && myPub?.inHand === true && (
        <div className="hl-pos flex gap-1" style={{ left: '50%', top: '72.5%', zIndex: 4 }}>
          {cards.map((c, k) => {
            const m = marks(c, mySeat)
            return <PlayingCard key={c} card={c} width={50} deal delay={k * 120} dim={myFolded || (m.dim && result !== null)} lift={m.lift} />
          })}
        </div>
      )}
    </div>
  )
}

interface SeatProps {
  pub: PublicState
  seat: PublicSeat
  index: number
  isMe: boolean
  offset: number
  style: CSSProperties
  marks: (c: Card, owner: number | null) => { dim: boolean; lift: boolean }
}

function SeatView({ pub, seat, index, isMe, offset, style, marks }: SeatProps) {
  const h = pub.hand
  const result = h?.result ?? null
  const isTurn = pub.phase === 'hand' && h !== null && h.toAct === index
  const won = result?.won[String(index)] ?? 0
  const label = result?.showdown ? result.labels[String(index)] : undefined
  const remaining = useRemaining(isTurn ? (h?.deadline ?? null) : null, offset)
  const fraction = remaining / pub.config.turnMs
  const busted = seat.stack === 0 && !seat.allIn && !(pub.phase === 'hand' && seat.inHand && !seat.folded)

  const cls = ['hl-pos', 'hl-seat']
  if (isTurn) cls.push('is-turn')
  if (seat.folded && seat.inHand) cls.push('is-folded')
  if (seat.sittingOut || seat.leaving) cls.push('is-out')
  if (won > 0) cls.push('is-winner')

  let tag: { text: string; cls: string } | null = null
  // At a showdown the hand name takes the place of the player's name on the plate, so no tag is needed.
  const showLabel = label !== undefined && !seat.folded
  if (showLabel) tag = null
  else if (won > 0) tag = { text: `+${won}`, cls: 't-win' }
  else if (seat.leaving) tag = { text: 'עזב', cls: 't-out' }
  else if (seat.sittingOut) tag = { text: 'יושב בחוץ', cls: 't-out' }
  else if (busted) tag = { text: 'בלי צ׳יפים', cls: 't-out' }
  else if (isTurn) tag = { text: `${Math.ceil(remaining / 1000)}`, cls: 't-turn' }
  else if (seat.allIn) tag = { text: 'אול-אין', cls: 't-allin' }
  else if (seat.last !== null && LAST[seat.last] !== undefined) tag = { text: LAST[seat.last] as string, cls: '' }

  const hash = [...seat.name].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const isDealer = h !== null && h.button === index && pub.phase !== 'waiting'

  return (
    <div className={cls.join(' ')} style={style}>
      <div className="hl-avatar" style={seat.avatar ? undefined : { background: AVATAR_BG[hash % AVATAR_BG.length] }}>
        {seat.avatar ? <img src={seat.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{[...seat.name.trim()][0] ?? '?'}</span>}
        {isTurn && <TurnRing fraction={fraction} />}
        {isDealer && <span className="hl-dealer">D</span>}
        {!isMe && seat.cards === null && seat.hasCards && (
          <span className="hl-backs">
            <CardBack width={17} />
            <CardBack width={17} />
          </span>
        )}
        {!isMe && seat.cards !== null && (
          <span className="hl-shown">
            {seat.cards.map((c) => (
              <PlayingCard key={c} card={c} width={27} deal {...marks(c, index)} />
            ))}
          </span>
        )}
        {won > 0 && seat.cards === null && <span className="hl-float">+{won}</span>}
      </div>
      <div className="hl-plate" dir="rtl">
        {showLabel ? (
          <span className={`hl-hand ${won > 0 ? 'win' : ''}`}>{label}</span>
        ) : (
          <bdi className="hl-name">{isMe ? 'אתה' : seat.name}</bdi>
        )}
        <span className="hl-stack" dir="ltr">
          {seat.stack}
        </span>
      </div>
      {tag !== null && (
        <span className={`hl-tag ${tag.cls}`} dir="rtl">
          {tag.text}
        </span>
      )}
    </div>
  )
}
