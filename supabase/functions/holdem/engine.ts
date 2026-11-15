/**
 * Texas Hold'em engine. Pure TypeScript with no imports: the very same file runs in the browser (practice
 * mode and hints), in vitest and in the Supabase edge function (supabase/functions/holdem/engine.ts is a
 * verbatim copy, checked by a test). The server is the only place that holds the full State; clients get
 * `publicView()` plus their own two cards.
 * All amounts are chips and always multiples of `config.unit`.
 */

export type Card = string // rank + suit, e.g. "As", "Td", "2c"

export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'

export class HoldemError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.name = 'HoldemError'
    this.code = code
  }
}

function fail(code: string): never {
  throw new HoldemError(code)
}

// ---------------------------------------------------------------------------------------------- cards

/** Uniform integer in [0, n). */
export type Rand = (n: number) => number

export function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s)
  return deck
}

export function shuffledDeck(rand: Rand): Card[] {
  const deck = freshDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    const t = deck[i] as Card
    deck[i] = deck[j] as Card
    deck[j] = t
  }
  return deck
}

const rankOf = (c: Card): number => RANKS.indexOf(c.charAt(0))

/** Score of exactly five cards: [category, ...tiebreakers], compared left to right. */
function score5(cards: readonly Card[]): number[] {
  const rs = cards.map(rankOf).sort((a, b) => b - a)
  const suit = (cards[0] as Card).charAt(1)
  const flush = cards.every((c) => c.charAt(1) === suit)
  const counts = new Map<number, number>()
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const order = groups.map((g) => g[0])
  const shape = groups.map((g) => g[1]).join('')
  let straightHigh = -1
  if (groups.length === 5) {
    const hi = rs[0] as number
    if (hi - (rs[4] as number) === 4) straightHigh = hi
    else if (hi === 12 && rs[1] === 3) straightHigh = 3 // the wheel: A-2-3-4-5
  }
  if (straightHigh >= 0 && flush) return [8, straightHigh]
  if (shape === '41') return [7, ...order]
  if (shape === '32') return [6, ...order]
  if (flush) return [5, ...rs]
  if (straightHigh >= 0) return [4, straightHigh]
  if (shape === '311') return [3, ...order]
  if (shape === '221') return [2, ...order]
  if (shape === '2111') return [1, ...order]
  return [0, ...rs]
}

export function compareScore(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

export interface Evaluated {
  score: number[]
  /** The five cards that play. */
  best: Card[]
}

/** Best five-card hand out of 5 to 7 cards. */
export function evaluate(cards: readonly Card[]): Evaluated {
  const n = cards.length
  if (n < 5 || n > 7) fail('BAD_CARDS')
  let best: Evaluated | null = null
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]] as Card[]
            const score = score5(five)
            if (best === null || compareScore(score, best.score) > 0) best = { score, best: five }
          }
  return best as Evaluated
}

const RANK_TEXT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const rt = (r: number | undefined): string => RANK_TEXT[r ?? 0] ?? '?'

/** Hebrew name of a scored hand, e.g. "זוג K". */
export function scoreLabel(score: readonly number[]): string {
  const [cat, a, b] = score
  switch (cat) {
    case 8:
      return a === 12 ? 'רויאל פלאש' : `סטרייט פלאש עד ${rt(a)}`
    case 7:
      return `רביעייה ${rt(a)}`
    case 6:
      return `פול האוס ${rt(a)}/${rt(b)}`
    case 5:
      return `פלאש ${rt(a)}`
    case 4:
      return `סטרייט עד ${rt(a)}`
    case 3:
      return `שלישייה ${rt(a)}`
    case 2:
      return `שני זוגות ${rt(a)}/${rt(b)}`
    case 1:
      return `זוג ${rt(a)}`
    default:
      return `${rt(a)} גבוה`
  }
}

/** What a player currently holds (their two cards plus whatever is on the board), for the on-screen hint. */
export function describeCards(cards: readonly Card[]): string {
  if (cards.length === 0) return ''
  if (cards.length >= 5) return scoreLabel(evaluate(cards.slice(0, 7)).score)
  const counts = new Map<number, number>()
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1)
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])
  const first = groups[0] as [number, number]
  const second = groups[1]
  if (first[1] === 4) return scoreLabel([7, first[0]])
  if (first[1] === 3) return scoreLabel([3, first[0]])
  if (first[1] === 2 && second !== undefined && second[1] === 2) return scoreLabel([2, first[0], second[0]])
  if (first[1] === 2) return scoreLabel([1, first[0]])
  return scoreLabel([0, first[0]])
}

// ---------------------------------------------------------------------------------------------- state

export interface Config {
  sb: number
  bb: number
  /** Chips for a buy-in and for every rebuy. */
  buyin: number
  /** Smallest chip; every amount is a multiple of it. */
  unit: number
  maxSeats: number
  minPlayers: number
  /** Time to act. When it runs out: check if possible, otherwise fold. */
  turnMs: number
  /** Pause before the first hand once enough players sit. */
  startMs: number
  /** Pause after a showdown / after everyone folded (the "Show" window). */
  showdownMs: number
  foldWinMs: number
}

export const DEFAULT_CONFIG: Config = {
  sb: 5,
  bb: 5,
  buyin: 250,
  unit: 5,
  maxSeats: 10,
  minPlayers: 2,
  turnMs: 30_000,
  startMs: 4_000,
  showdownMs: 8_000,
  foldWinMs: 5_000,
}

export interface Seat {
  userId: string
  name: string
  avatar: string | null
  bot: boolean
  stack: number
  /** Total chips bought so far (buy-in + rebuys). */
  bought: number
  /** Not dealt in. The seat and the stack are kept and stay visible to everyone. */
  sittingOut: boolean
  /** Asked to sit out; applied when the current hand ends. */
  sitOutNext: boolean
  /** Left during a hand; the seat is freed when the hand is over. */
  leaving: boolean
  /** Consecutive hands in which the player only timed out. Two in a row -> sitting out. */
  missed: number
  // --- per hand
  inHand: boolean
  folded: boolean
  allIn: boolean
  /** Chips put in on the current street. */
  bet: number
  /** Chips put in during the whole hand. */
  committed: number
  /** Acted since the last full raise (a short all-in does not re-open the betting for them). */
  acted: boolean
  timedOut: boolean
  didAct: boolean
  last: string | null
  /** Cards are face up for everyone. */
  shown: boolean
}

export interface HandResult {
  showdown: boolean
  total: number
  pots: { amount: number; winners: number[] }[]
  /** Seat index -> chips won. */
  won: Record<string, number>
  /** Seat index -> hand name (showdown only). */
  labels: Record<string, string>
  /** Seat index -> the five cards that play, for winners at a showdown. */
  best: Record<string, Card[]>
}

export interface Hand {
  no: number
  button: number
  sb: number
  bb: number
  /** PRIVATE: remaining deck. */
  deck: Card[]
  /** PRIVATE: seat index -> two cards. */
  hole: Record<string, Card[]>
  board: Card[]
  /** 0 pre-flop, 1 flop, 2 turn, 3 river. */
  street: number
  toAct: number | null
  currentBet: number
  /** Minimum raise increment. */
  minRaise: number
  /** Epoch ms (server clock) when the player to act times out. */
  deadline: number | null
  result: HandResult | null
}

export interface LedgerEntry {
  name: string
  avatar: string | null
  bought: number
  stack: number
}

export type Phase = 'waiting' | 'between' | 'hand'

export interface State {
  config: Config
  ownerId: string
  closed: boolean
  seats: (Seat | null)[]
  /** Players who left: their chips wait for them if they come back. */
  ledger: Record<string, LedgerEntry>
  phase: Phase
  /** In 'between': when the next hand starts. */
  nextAt: number | null
  handNo: number
  button: number
  hand: Hand | null
}

export type Action =
  | { type: 'sit'; seat?: number }
  | { type: 'leave' }
  | { type: 'rebuy' }
  | { type: 'sit_out' }
  | { type: 'sit_in' }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'show' }
  | { type: 'tick' }
  | { type: 'close' }

export interface Ctx {
  now: number
  rand: Rand
  isAdmin?: boolean
  /** Name and picture of the acting user (needed for `sit`). */
  profile?: { name: string; avatar: string | null }
  bot?: boolean
  /** Tests only: the deck to deal from (cards are taken from the end). */
  deck?: Card[]
}

export function createState(ownerId: string, config: Config = DEFAULT_CONFIG): State {
  return {
    config: { ...config },
    ownerId,
    closed: false,
    seats: Array.from({ length: config.maxSeats }, () => null),
    ledger: {},
    phase: 'waiting',
    nextAt: null,
    handNo: 0,
    button: -1,
    hand: null,
  }
}

// ---------------------------------------------------------------------------------------------- helpers

const seatAt = (st: State, i: number): Seat | null => st.seats[i] ?? null

function mustSeat(st: State, i: number): Seat {
  const s = seatAt(st, i)
  if (s === null) fail('NOT_SEATED')
  return s
}

export function seatIndexOf(st: { seats: ({ userId: string } | null)[] }, userId: string): number {
  return st.seats.findIndex((s) => s !== null && s.userId === userId)
}

const canDeal = (s: Seat): boolean => !s.sittingOut && !s.leaving && s.stack > 0

function countDealable(st: State): number {
  return st.seats.filter((s) => s !== null && canDeal(s)).length
}

/** First seat clockwise after `from` that matches, or -1. */
function nextIndex(st: State, from: number, pred: (s: Seat, i: number) => boolean): number {
  const n = st.seats.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n
    const s = seatAt(st, i)
    if (s !== null && pred(s, i)) return i
  }
  return -1
}

function aliveIdx(st: State): number[] {
  const out: number[] = []
  st.seats.forEach((s, i) => {
    if (s !== null && s.inHand && !s.folded) out.push(i)
  })
  return out
}

function put(s: Seat, amount: number): void {
  s.stack -= amount
  s.bet += amount
  s.committed += amount
  if (s.stack === 0) s.allIn = true
}

function resetHandFields(s: Seat): void {
  s.inHand = false
  s.folded = false
  s.allIn = false
  s.bet = 0
  s.committed = 0
  s.acted = false
  s.timedOut = false
  s.didAct = false
  s.last = null
  s.shown = false
}

function removeSeat(st: State, i: number): void {
  const s = seatAt(st, i)
  if (s === null) return
  st.ledger[s.userId] = { name: s.name, avatar: s.avatar, bought: s.bought, stack: s.stack }
  st.seats[i] = null
}

function maybeStart(st: State, ctx: Ctx): void {
  if (st.closed || st.phase !== 'waiting') return
  if (countDealable(st) >= st.config.minPlayers) {
    st.phase = 'between'
    st.nextAt = ctx.now + st.config.startMs
    st.hand = null
  }
}

// ---------------------------------------------------------------------------------------------- turn options

export interface TurnOptions {
  toCall: number
  canCheck: boolean
  canRaise: boolean
  /** Raise-to bounds (total bet on this street). When minTo === maxTo the only raise is all-in. */
  minTo: number
  maxTo: number
}

export function turnOptions(st: State, idx: number): TurnOptions {
  const h = st.hand
  const s = seatAt(st, idx)
  if (h === null || s === null) return { toCall: 0, canCheck: false, canRaise: false, minTo: 0, maxTo: 0 }
  const owed = Math.max(0, h.currentBet - s.bet)
  const others = st.seats.some((o, i) => o !== null && i !== idx && o.inHand && !o.folded && !o.allIn)
  const maxTo = s.bet + s.stack
  return {
    toCall: Math.min(owed, s.stack),
    canCheck: owed === 0,
    canRaise: !s.acted && s.stack > owed && others,
    minTo: Math.min(h.currentBet + h.minRaise, maxTo),
    maxTo,
  }
}

// ---------------------------------------------------------------------------------------------- hand flow

function nextToAct(st: State, from: number): number {
  const h = st.hand as Hand
  const actors = st.seats.filter((s): s is Seat => s !== null && s.inHand && !s.folded && !s.allIn)
  if (actors.length === 0) return -1
  // A single player with chips who already matched the bet has nobody left to bet against.
  if (actors.length === 1 && (actors[0] as Seat).bet >= h.currentBet) return -1
  return nextIndex(st, from, (s) => s.inHand && !s.folded && !s.allIn && (s.bet < h.currentBet || !s.acted))
}

function beginNextHand(st: State, ctx: Ctx): void {
  st.seats.forEach((s, i) => {
    if (s === null) return
    if (s.leaving) removeSeat(st, i)
    else resetHandFields(s)
  })
  if (countDealable(st) < st.config.minPlayers) {
    st.phase = 'waiting'
    st.nextAt = null
    st.hand = null
    return
  }
  let button: number
  if (st.button < 0) {
    const dealable: number[] = []
    st.seats.forEach((s, i) => {
      if (s !== null && canDeal(s)) dealable.push(i)
    })
    button = dealable[ctx.rand(dealable.length)] as number
  } else {
    button = nextIndex(st, st.button, canDeal)
  }
  const dealt: number[] = []
  for (let i = nextIndex(st, button, canDeal); dealt.length === 0 || i !== dealt[0]; i = nextIndex(st, i, canDeal)) {
    dealt.push(i)
  }
  // Heads-up: the button posts the small blind and acts first before the flop.
  const sb = dealt.length === 2 ? button : (dealt[0] as number)
  const bb = nextIndex(st, sb, canDeal)

  const deck = ctx.deck ? [...ctx.deck] : shuffledDeck(ctx.rand)
  const hole: Record<string, Card[]> = {}
  for (const i of dealt) {
    mustSeat(st, i).inHand = true
    hole[String(i)] = [deck.pop() as Card, deck.pop() as Card]
  }
  st.handNo += 1
  st.button = button
  const sbSeat = mustSeat(st, sb)
  const bbSeat = mustSeat(st, bb)
  put(sbSeat, Math.min(sbSeat.stack, st.config.sb))
  sbSeat.last = 'sb'
  put(bbSeat, Math.min(bbSeat.stack, st.config.bb))
  bbSeat.last = 'bb'
  st.hand = {
    no: st.handNo,
    button,
    sb,
    bb,
    deck,
    hole,
    board: [],
    street: 0,
    toAct: null,
    currentBet: Math.max(sbSeat.bet, bbSeat.bet),
    minRaise: st.config.bb,
    deadline: null,
    result: null,
  }
  st.phase = 'hand'
  st.nextAt = null
  advance(st, ctx, bb)
}

/** After a seat acted: pass the turn, close the betting round, deal, or finish the hand. */
function advance(st: State, ctx: Ctx, from: number): void {
  const h = st.hand as Hand
  const alive = aliveIdx(st)
  if (alive.length === 1) {
    finish(st, ctx, false)
    return
  }
  const next = nextToAct(st, from)
  if (next >= 0) {
    h.toAct = next
    h.deadline = ctx.now + st.config.turnMs
    return
  }
  // The betting round is complete.
  for (const s of st.seats) {
    if (s === null || !s.inHand) continue
    s.bet = 0
    s.acted = false
    if (!s.folded && !s.allIn) s.last = null
  }
  h.currentBet = 0
  h.minRaise = st.config.bb
  if (h.street === 3) {
    finish(st, ctx, true)
    return
  }
  const actors = alive.filter((i) => !mustSeat(st, i).allIn)
  if (actors.length <= 1) {
    // Nobody can bet any more: run the board out.
    while (h.board.length < 5) h.board.push(h.deck.pop() as Card)
    h.street = 3
    finish(st, ctx, true)
    return
  }
  h.street += 1
  const deal = h.street === 1 ? 3 : 1
  for (let k = 0; k < deal; k++) h.board.push(h.deck.pop() as Card)
  h.toAct = nextToAct(st, h.button)
  h.deadline = ctx.now + st.config.turnMs
}

/** A bet that nobody called goes back to the bettor. */
function refundUncalled(st: State): void {
  const inHand = st.seats.filter((s): s is Seat => s !== null && s.inHand).sort((a, b) => b.committed - a.committed)
  const top = inHand[0]
  const second = inHand[1]
  if (top === undefined || second === undefined || top.committed <= second.committed) return
  const diff = top.committed - second.committed
  top.committed -= diff
  top.stack += diff
  top.allIn = false
}

/** Main pot and side pots, each with the seats that can win it. */
function buildPots(st: State): { amount: number; eligible: number[] }[] {
  const rem = st.seats.map((s) => (s !== null && s.inHand ? s.committed : 0))
  const pots: { amount: number; eligible: number[] }[] = []
  for (;;) {
    const live: number[] = []
    rem.forEach((r, i) => {
      const s = seatAt(st, i)
      if (r > 0 && s !== null && !s.folded) live.push(i)
    })
    if (live.length === 0) break
    const level = Math.min(...live.map((i) => rem[i] as number))
    let amount = 0
    rem.forEach((r, i) => {
      const take = Math.min(r, level)
      amount += take
      rem[i] = r - take
    })
    const prev = pots[pots.length - 1]
    if (prev !== undefined && prev.eligible.length === live.length && prev.eligible.every((v, k) => v === live[k])) {
      prev.amount += amount
    } else {
      pots.push({ amount, eligible: live })
    }
  }
  const leftover = rem.reduce((a, b) => a + b, 0)
  const last = pots[pots.length - 1]
  if (leftover > 0 && last !== undefined) last.amount += leftover
  return pots
}

function finish(st: State, ctx: Ctx, showdown: boolean): void {
  const h = st.hand as Hand
  const n = st.seats.length
  h.toAct = null
  h.deadline = null
  refundUncalled(st)
  const total = st.seats.reduce((sum, s) => sum + (s !== null && s.inHand ? s.committed : 0), 0)
  const result: HandResult = { showdown, total, pots: [], won: {}, labels: {}, best: {} }
  const alive = aliveIdx(st)
  const award = (i: number, amount: number): void => {
    mustSeat(st, i).stack += amount
    result.won[String(i)] = (result.won[String(i)] ?? 0) + amount
  }
  if (!showdown) {
    const w = alive[0] as number
    award(w, total)
    result.pots.push({ amount: total, winners: [w] })
  } else {
    const evals = new Map<number, Evaluated>()
    for (const i of alive) {
      const ev = evaluate([...(h.hole[String(i)] ?? []), ...h.board])
      evals.set(i, ev)
      result.labels[String(i)] = scoreLabel(ev.score)
      mustSeat(st, i).shown = true
    }
    const clockwise = (i: number): number => (i - h.button - 1 + n) % n
    for (const pot of buildPots(st)) {
      let bestScore: number[] | null = null
      for (const i of pot.eligible) {
        const sc = (evals.get(i) as Evaluated).score
        if (bestScore === null || compareScore(sc, bestScore) > 0) bestScore = sc
      }
      const winners = pot.eligible
        .filter((i) => compareScore((evals.get(i) as Evaluated).score, bestScore as number[]) === 0)
        .sort((a, b) => clockwise(a) - clockwise(b))
      const unit = st.config.unit
      const share = Math.floor(pot.amount / winners.length / unit) * unit
      let odd = pot.amount - share * winners.length
      for (const w of winners) {
        const extra = odd > 0 ? Math.min(unit, odd) : 0
        odd -= extra
        award(w, share + extra)
        result.best[String(w)] = (evals.get(w) as Evaluated).best
      }
      result.pots.push({ amount: pot.amount, winners })
    }
  }
  for (const s of st.seats) {
    if (s === null) continue
    if (s.inHand) {
      s.bet = 0
      s.committed = 0
      s.allIn = false
      if (s.timedOut && !s.didAct) s.missed += 1
      else if (s.didAct) s.missed = 0
      if (s.missed >= 2) {
        s.sittingOut = true
        s.missed = 0
      }
    }
    if (s.sitOutNext) {
      s.sittingOut = true
      s.sitOutNext = false
    }
  }
  h.result = result
  st.phase = 'between'
  st.nextAt = ctx.now + (showdown ? st.config.showdownMs : st.config.foldWinMs)
}

type BetAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number }

function bet(st: State, idx: number, action: BetAction, ctx: Ctx, auto: boolean): void {
  const h = st.hand as Hand
  const s = mustSeat(st, idx)
  const opts = turnOptions(st, idx)
  switch (action.type) {
    case 'fold':
      s.folded = true
      s.last = 'fold'
      break
    case 'check':
      if (!opts.canCheck) fail('ILLEGAL_ACTION')
      s.last = 'check'
      break
    case 'call':
      if (opts.canCheck) fail('ILLEGAL_ACTION')
      put(s, opts.toCall)
      s.last = s.allIn ? 'allin' : 'call'
      break
    case 'raise': {
      const to = action.to
      if (!opts.canRaise) fail('ILLEGAL_ACTION')
      if (!Number.isInteger(to) || to % st.config.unit !== 0 || to < opts.minTo || to > opts.maxTo) fail('BAD_AMOUNT')
      const opened = h.currentBet === 0
      const size = to - h.currentBet
      put(s, to - s.bet)
      if (size >= h.minRaise) {
        h.minRaise = size
        st.seats.forEach((o, i) => {
          if (o !== null && i !== idx) o.acted = false
        })
      }
      h.currentBet = to
      s.last = s.allIn ? 'allin' : opened ? 'bet' : 'raise'
      break
    }
  }
  s.acted = true
  if (auto) s.timedOut = true
  else s.didAct = true
  advance(st, ctx, idx)
}

// ---------------------------------------------------------------------------------------------- actions

/**
 * Applies one action and returns the new state. The input is never mutated.
 * A `tick` that has nothing to do returns the very same object, so callers can skip the write.
 */
export function applyAction(state: State, userId: string, action: Action, ctx: Ctx): State {
  if (state.closed) fail('TABLE_CLOSED')
  if (action.type === 'tick') {
    const h = state.hand
    const turnOver = state.phase === 'hand' && h !== null && h.toAct !== null && h.deadline !== null && ctx.now >= h.deadline
    const startDue = state.phase === 'between' && state.nextAt !== null && ctx.now >= state.nextAt
    if (!turnOver && !startDue) return state
  }
  const st = JSON.parse(JSON.stringify(state)) as State
  const idx = seatIndexOf(st, userId)

  switch (action.type) {
    case 'tick': {
      const h = st.hand
      if (st.phase === 'hand' && h !== null && h.toAct !== null) {
        const opts = turnOptions(st, h.toAct)
        bet(st, h.toAct, opts.canCheck ? { type: 'check' } : { type: 'fold' }, ctx, true)
      } else {
        beginNextHand(st, ctx)
      }
      return st
    }

    case 'sit': {
      if (idx >= 0) {
        const s = mustSeat(st, idx)
        if (!s.leaving) fail('ALREADY_SEATED')
        s.leaving = false
        maybeStart(st, ctx)
        return st
      }
      let target = action.seat
      if (target === undefined) target = st.seats.findIndex((s) => s === null)
      if (!Number.isInteger(target) || target < 0 || target >= st.seats.length) fail(action.seat === undefined ? 'TABLE_FULL' : 'INVALID_SEAT')
      if (seatAt(st, target) !== null) fail('SEAT_TAKEN')
      const prev = st.ledger[userId]
      delete st.ledger[userId]
      let stack = prev?.stack ?? 0
      let bought = prev?.bought ?? 0
      if (stack <= 0) {
        stack = st.config.buyin
        bought += st.config.buyin
      }
      st.seats[target] = {
        userId,
        name: ctx.profile?.name || prev?.name || 'שחקן',
        avatar: ctx.profile?.avatar ?? prev?.avatar ?? null,
        bot: ctx.bot === true,
        stack,
        bought,
        sittingOut: false,
        sitOutNext: false,
        leaving: false,
        missed: 0,
        inHand: false,
        folded: false,
        allIn: false,
        bet: 0,
        committed: 0,
        acted: false,
        timedOut: false,
        didAct: false,
        last: null,
        shown: false,
      }
      maybeStart(st, ctx)
      return st
    }

    case 'close': {
      if (userId !== st.ownerId && ctx.isAdmin !== true) fail('NOT_ALLOWED')
      if (st.phase === 'hand') {
        // Cancel the running hand: everyone gets back what they put in.
        for (const s of st.seats) {
          if (s === null || !s.inHand) continue
          s.stack += s.committed
          resetHandFields(s)
        }
      }
      st.hand = null
      st.phase = 'waiting'
      st.nextAt = null
      st.closed = true
      return st
    }
  }

  if (idx < 0) fail('NOT_SEATED')
  const s = mustSeat(st, idx)
  const h = st.hand

  switch (action.type) {
    case 'leave': {
      if (st.phase === 'waiting' || h === null) {
        removeSeat(st, idx)
        return st
      }
      s.leaving = true
      if (st.phase === 'hand' && s.inHand && !s.folded) {
        if (h.toAct === idx) {
          bet(st, idx, { type: 'fold' }, ctx, true)
        } else {
          s.folded = true
          s.last = 'fold'
          if (aliveIdx(st).length === 1) finish(st, ctx, false)
        }
      }
      return st
    }

    case 'rebuy': {
      if (s.stack > 0) fail('HAS_CHIPS')
      if (st.phase === 'hand' && s.inHand && !s.folded) fail('ILLEGAL_ACTION')
      s.stack += st.config.buyin
      s.bought += st.config.buyin
      maybeStart(st, ctx)
      return st
    }

    case 'sit_out': {
      if (st.phase === 'hand' && s.inHand && !s.folded) s.sitOutNext = true
      else s.sittingOut = true
      return st
    }

    case 'sit_in': {
      s.sittingOut = false
      s.sitOutNext = false
      s.missed = 0
      maybeStart(st, ctx)
      return st
    }

    case 'show': {
      if (st.phase !== 'between' || h === null || h.result === null) fail('ILLEGAL_ACTION')
      if (h.hole[String(idx)] === undefined) fail('ILLEGAL_ACTION')
      s.shown = true
      return st
    }

    case 'fold':
    case 'check':
    case 'call':
    case 'raise': {
      if (st.phase !== 'hand' || h === null || h.toAct !== idx) fail('NOT_YOUR_TURN')
      bet(st, idx, action, ctx, false)
      return st
    }
  }
  return fail('ILLEGAL_ACTION')
}

// ---------------------------------------------------------------------------------------------- views

export interface PublicSeat {
  userId: string
  name: string
  avatar: string | null
  bot: boolean
  stack: number
  bought: number
  sittingOut: boolean
  sitOutNext: boolean
  leaving: boolean
  inHand: boolean
  folded: boolean
  allIn: boolean
  bet: number
  last: string | null
  /** Holds two face-down cards. */
  hasCards: boolean
  /** Face-up cards (showdown, or the player pressed Show). */
  cards: Card[] | null
}

export interface PublicHand {
  no: number
  button: number
  sb: number
  bb: number
  board: Card[]
  street: number
  toAct: number | null
  deadline: number | null
  currentBet: number
  /** Everything in the middle, including the bets of the current street. */
  pot: number
  /** What the player to act may do. */
  options: TurnOptions | null
  result: HandResult | null
}

export interface Standing {
  userId: string
  name: string
  avatar: string | null
  bought: number
  stack: number
  seated: boolean
}

export interface PublicState {
  v: number
  closed: boolean
  ownerId: string
  config: Config
  phase: Phase
  nextAt: number | null
  handNo: number
  seats: (PublicSeat | null)[]
  hand: PublicHand | null
  standings: Standing[]
}

/** What everybody may see. Never contains the deck or face-down cards. */
export function publicView(st: State, v: number): PublicState {
  const h = st.hand
  const seats = st.seats.map((s, i): PublicSeat | null => {
    if (s === null) return null
    const hole = h?.hole[String(i)]
    return {
      userId: s.userId,
      name: s.name,
      avatar: s.avatar,
      bot: s.bot,
      stack: s.stack,
      bought: s.bought,
      sittingOut: s.sittingOut,
      sitOutNext: s.sitOutNext,
      leaving: s.leaving,
      inHand: s.inHand,
      folded: s.folded,
      allIn: s.allIn,
      bet: s.bet,
      last: s.last,
      hasCards: hole !== undefined && s.inHand && !s.folded,
      cards: hole !== undefined && s.shown ? [...hole] : null,
    }
  })
  const standings: Standing[] = []
  for (const s of st.seats) {
    if (s !== null) standings.push({ userId: s.userId, name: s.name, avatar: s.avatar, bought: s.bought, stack: s.stack + s.committed, seated: true })
  }
  for (const [userId, e] of Object.entries(st.ledger)) {
    standings.push({ userId, name: e.name, avatar: e.avatar, bought: e.bought, stack: e.stack, seated: false })
  }
  standings.sort((a, b) => b.stack - b.bought - (a.stack - a.bought) || a.name.localeCompare(b.name))
  return {
    v,
    closed: st.closed,
    ownerId: st.ownerId,
    config: st.config,
    phase: st.phase,
    nextAt: st.nextAt,
    handNo: st.handNo,
    seats,
    hand:
      h === null
        ? null
        : {
            no: h.no,
            button: h.button,
            sb: h.sb,
            bb: h.bb,
            board: [...h.board],
            street: h.street,
            toAct: h.toAct,
            deadline: h.deadline,
            currentBet: h.currentBet,
            pot: h.result !== null ? h.result.total : st.seats.reduce((sum, s) => sum + (s !== null ? s.committed : 0), 0),
            options: h.toAct !== null ? turnOptions(st, h.toAct) : null,
            result: h.result,
          },
    standings,
  }
}

/** A player's own two cards in the current hand (also after folding), or null. */
export function cardsOf(st: State, userId: string): Card[] | null {
  const idx = seatIndexOf(st, userId)
  if (idx < 0 || st.hand === null) return null
  return st.hand.hole[String(idx)] ?? null
}

/** userId -> two cards, for the hand that is being played. */
export function holeByUser(st: State): Record<string, Card[]> {
  const out: Record<string, Card[]> = {}
  if (st.hand === null) return out
  for (const [i, cards] of Object.entries(st.hand.hole)) {
    const s = seatAt(st, Number(i))
    if (s !== null) out[s.userId] = cards
  }
  return out
}

/** Chips of a pile, biggest first: 340 -> [100, 100, 100, 25, 10, 5]. */
export function chipBreakdown(amount: number, values: readonly number[] = [250, 100, 25, 10, 5]): number[] {
  const out: number[] = []
  let left = amount
  for (const v of values) {
    while (left >= v) {
      out.push(v)
      left -= v
    }
  }
  return out
}
