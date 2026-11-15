import { useEffect, useState, type ReactNode } from 'react'
import { describeCards, seatIndexOf, type Action, type Card, type PublicHand, type PublicState, type TurnOptions } from '../../lib/holdem/engine'
import { useRemaining } from './pieces'

interface Props {
  pub: PublicState
  me: string
  cards: Card[] | null
  offset: number
  act: (action: Action) => Promise<boolean>
  busy: boolean
  error: string | null
}

const round5 = (n: number): number => Math.round(n / 5) * 5
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/** Everything under the table: my buttons when it is my turn, otherwise what I can do right now. */
export function ActionBar({ pub, me, cards, offset, act, busy, error }: Props) {
  const idx = seatIndexOf(pub, me)
  const seat = idx >= 0 ? (pub.seats[idx] ?? null) : null
  const h = pub.hand
  const myTurn = seat !== null && pub.phase === 'hand' && h !== null && h.toAct === idx
  const untilNext = useRemaining(pub.phase === 'between' ? pub.nextAt : null, offset)
  const hint = cards !== null && seat?.inHand === true && h !== null ? describeCards([...cards, ...h.board]) : ''

  useEffect(() => {
    if (myTurn && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(70)
  }, [myTurn])

  let body: ReactNode
  if (seat === null) {
    const full = pub.seats.every((s) => s !== null)
    body = full ? (
      <Status text="השולחן מלא כרגע. אפשר לצפות ולחכות לכיסא שיתפנה." />
    ) : (
      <>
        <Status text={`כניסה לשולחן: ${pub.config.buyin} צ׳יפים. אפשר גם ללחוץ על כיסא פנוי.`} />
        <div className="flex gap-2">
          <button type="button" className="hl-btn brass" disabled={busy} onClick={() => void act({ type: 'sit' })}>
            הצטרפות לשולחן
          </button>
        </div>
      </>
    )
  } else if (seat.leaving) {
    body = (
      <>
        <Status text="עזבת את השולחן. הצ׳יפים שלך נשמרים." />
        <div className="flex gap-2">
          <button type="button" className="hl-btn call" disabled={busy} onClick={() => void act({ type: 'sit' })}>
            חזרה לשולחן
          </button>
        </div>
      </>
    )
  } else if (myTurn && h !== null && h.options !== null) {
    body = (
      <TurnControls
        key={`${h.no}-${h.street}-${h.currentBet}`}
        hand={h}
        opts={h.options}
        stack={seat.stack}
        myBet={seat.bet}
        bb={pub.config.bb}
        turnMs={pub.config.turnMs}
        offset={offset}
        hint={hint}
        act={act}
        busy={busy}
      />
    )
  } else if (seat.stack === 0 && !(pub.phase === 'hand' && seat.inHand && !seat.folded)) {
    body = (
      <>
        <Status text="נגמרו לך הצ׳יפים." />
        <div className="flex gap-2">
          <button type="button" className="hl-btn brass" disabled={busy} onClick={() => void act({ type: 'rebuy' })}>
            ריביי
            <small dir="ltr">{pub.config.buyin}</small>
          </button>
        </div>
      </>
    )
  } else if (seat.sittingOut) {
    body = (
      <>
        <Status text={`אתה יושב בחוץ. הכיסא ו-${seat.stack} הצ׳יפים שלך נשמרים.`} tone="amber" />
        <div className="flex gap-2">
          <button type="button" className="hl-btn raise" disabled={busy} onClick={() => void act({ type: 'sit_in' })}>
            חזרתי לשחק
          </button>
        </div>
      </>
    )
  } else if (pub.phase === 'between' && h?.result && cards !== null && seat.cards === null) {
    body = (
      <>
        <Status text={`רוצה להראות מה היה לך? נשארו ${Math.ceil(untilNext / 1000)} שניות`} />
        <div className="flex gap-2">
          <button type="button" className="hl-btn brass" lang="en" disabled={busy} onClick={() => void act({ type: 'show' })}>
            Show
          </button>
        </div>
      </>
    )
  } else if (pub.phase === 'waiting') {
    body = <Status text="ממתינים לשחקן נוסף כדי להתחיל…" />
  } else if (pub.phase === 'between') {
    body = <Status text={h?.result ? 'היד הבאה מתחילה מיד…' : `מתחילים בעוד ${Math.ceil(untilNext / 1000)}…`} />
  } else {
    const actor = h !== null && h.toAct !== null ? pub.seats[h.toAct] : null
    const waitingFor = actor ? `התור של ${actor.name}` : ''
    const mine = seat.sitOutNext ? '' : seat.folded ? 'עשית פולד' : seat.allIn ? 'אתה באול-אין' : hint
    body = <Status text={[waitingFor, mine].filter(Boolean).join(' · ')} />
  }

  return (
    <div className="hl-bar space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" dir="rtl">
      {error !== null && (
        <p role="alert" className="text-center text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="flex min-h-[7.25rem] flex-col justify-end gap-2">{body}</div>
    </div>
  )
}

function Status({ text, tone = 'slate' }: { text: string; tone?: 'slate' | 'amber' }) {
  return <p className={`text-center text-sm ${tone === 'amber' ? 'text-amber-300' : 'text-slate-300'}`}>{text}</p>
}

interface TurnProps {
  hand: PublicHand
  opts: TurnOptions
  stack: number
  myBet: number
  bb: number
  turnMs: number
  offset: number
  hint: string
  act: (action: Action) => Promise<boolean>
  busy: boolean
}

function TurnControls({ hand, opts, stack, myBet, bb, turnMs, offset, hint, act, busy }: TurnProps) {
  const [to, setTo] = useState(opts.minTo)
  const remaining = useRemaining(hand.deadline, offset)
  const fraction = clamp(remaining / turnMs, 0, 1)
  const opening = hand.currentBet === 0
  const allInOnly = opts.canRaise && opts.minTo >= opts.maxTo
  const callAllIn = opts.toCall >= stack
  const potAfterCall = hand.pot + opts.toCall
  const preset = (f: number): number => clamp(round5(hand.currentBet + potAfterCall * f), opts.minTo, opts.maxTo)
  const value = clamp(to, opts.minTo, opts.maxTo)

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="font-bold text-amber-200">התור שלך</span>
        <span className="hl-timebar flex-1">
          <i style={{ width: `${fraction * 100}%`, background: fraction < 0.25 ? '#f43f5e' : undefined }} />
        </span>
        <span className="font-num tabular-nums" dir="ltr">
          {Math.ceil(remaining / 1000)}
        </span>
        {hint !== '' && <span className="text-emerald-300">{hint}</span>}
      </div>

      {opts.canRaise && !allInOnly && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button type="button" className="hl-quick !flex-none px-3" onClick={() => setTo(clamp(value - bb, opts.minTo, opts.maxTo))} aria-label="פחות">
              −
            </button>
            <input
              id="hl-raise"
              type="range"
              className="hl-range"
              min={opts.minTo}
              max={opts.maxTo}
              step={5}
              value={value}
              onChange={(e) => setTo(Number(e.target.value))}
              aria-label="גובה ההימור"
            />
            <button type="button" className="hl-quick !flex-none px-3" onClick={() => setTo(clamp(value + bb, opts.minTo, opts.maxTo))} aria-label="יותר">
              +
            </button>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="hl-quick" onClick={() => setTo(opts.minTo)}>
              מינימום
            </button>
            <button type="button" className="hl-quick" onClick={() => setTo(preset(0.5))}>
              ½ קופה
            </button>
            <button type="button" className="hl-quick" onClick={() => setTo(preset(1))}>
              קופה
            </button>
            <button type="button" className="hl-quick" onClick={() => setTo(opts.maxTo)}>
              אול-אין
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="hl-btn fold" disabled={busy} onClick={() => void act({ type: 'fold' })}>
          פולד
        </button>
        {opts.canCheck ? (
          <button type="button" className="hl-btn call" disabled={busy} onClick={() => void act({ type: 'check' })}>
            צ׳ק
          </button>
        ) : (
          <button type="button" className="hl-btn call" disabled={busy} onClick={() => void act({ type: 'call' })}>
            {callAllIn ? 'אול-אין' : 'קול'}
            <small dir="ltr">{opts.toCall}</small>
          </button>
        )}
        {opts.canRaise && (
          <button type="button" className="hl-btn raise" disabled={busy} onClick={() => void act({ type: 'raise', to: allInOnly ? opts.maxTo : value })}>
            {allInOnly || value >= opts.maxTo ? 'אול-אין' : opening ? 'הימור' : 'רייז ל-'}
            <small dir="ltr">{allInOnly ? opts.maxTo - myBet : value}</small>
          </button>
        )}
      </div>
    </>
  )
}
