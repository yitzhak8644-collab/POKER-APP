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
  /** House rule: whoever wins a pot holding 7-2 collects this much from every seated player. */
  sevenDeuceBonus: number
  /** A rebuy is allowed once the stack is below this (between hands). */
  rebuyBelow: number
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
  sevenDeuceBonus: 40,
  rebuyBelow: 40,
}

// ---------------------------------------------------------------------------------------------- tournament

export interface BlindLevel {
  sb: number
  bb: number
}

export interface TournamentConfig {
  levels: BlindLevel[]
  /** Length of a blind level. */
  levelMs: number
  /** Rebuys are allowed during the first N levels (only with no chips left). */
  rebuyLevels: number
  /** New players may still sit down during the first N levels. */
  lateRegLevels: number
  /** A player who ran out of chips while rebuys are open has this long to rebuy; then they are out. */
  rebuyDecideMs: number
}

export const DEFAULT_TOURNAMENT: TournamentConfig = {
  levels: [
    { sb: 5, bb: 5 },
    { sb: 5, bb: 10 },
    { sb: 10, bb: 20 },
    { sb: 15, bb: 30 },
    { sb: 25, bb: 50 },
    { sb: 50, bb: 100 },
    { sb: 75, bb: 150 },
    { sb: 100, bb: 200 },
    { sb: 150, bb: 300 },
    { sb: 200, bb: 400 },
    { sb: 300, bb: 600 },
  ],
  levelMs: 10 * 60_000,
  rebuyLevels: 3,
  lateRegLevels: 1,
  rebuyDecideMs: 60_000,
}

export interface TournamentPlace {
  userId: string
  name: string
  avatar: string | null
  place: number
  /** Buy-in + rebuys. */
  entries: number
}

export type TournamentStatus = 'registering' | 'running' | 'finished' | 'cancelled'

export interface Tournament extends TournamentConfig {
  status: TournamentStatus
  startedAt: number | null
  /** userId -> buy-in + rebuys. */
  entries: Record<string, number>
  /** Out of chips while rebuys are open: when, and the stack they started that hand with (orders places). */
  busted: Record<string, { at: number; start: number }>
  /** Knocked out, in the order it happened (worst place first). */
  out: TournamentPlace[]
  winner: TournamentPlace | null
}

export interface TournamentClock {
  /** 0-based level in play by the clock. */
  index: number
  level: BlindLevel
  next: BlindLevel
  /** When the next level starts (null before the start). */
  nextAt: number | null
  rebuyOpen: boolean
  rebuyEndsAt: number | null
  lateRegOpen: boolean
  lateRegEndsAt: number | null
}

type TournamentTimes = Pick<Tournament, 'levels' | 'levelMs' | 'rebuyLevels' | 'lateRegLevels' | 'status' | 'startedAt'>

/** Level `i`; past the end of the list the last level keeps doubling. */
export function levelNo(t: Pick<Tournament, 'levels'>, i: number): BlindLevel {
  const list = t.levels
  if (i < list.length) return list[Math.max(0, i)] as BlindLevel
  const last = list[list.length - 1] as BlindLevel
  const f = 2 ** (i - list.length + 1)
  return { sb: last.sb * f, bb: last.bb * f }
}

function levelIndex(t: TournamentTimes, now: number): number {
  if (t.startedAt === null) return 0
  return Math.max(0, Math.floor((now - t.startedAt) / t.levelMs))
}

const levelAt = (t: TournamentTimes, now: number): BlindLevel => levelNo(t, levelIndex(t, now))
const rebuyEndsAt = (t: TournamentTimes): number => (t.startedAt ?? 0) + t.rebuyLevels * t.levelMs

export function tournamentClock(t: TournamentTimes, now: number): TournamentClock {
  const index = levelIndex(t, now)
  const started = t.startedAt !== null
  const running = t.status === 'running'
  const lateEnd = started ? (t.startedAt as number) + t.lateRegLevels * t.levelMs : null
  return {
    index,
    level: levelNo(t, index),
    next: levelNo(t, index + 1),
    nextAt: started ? (t.startedAt as number) + (index + 1) * t.levelMs : null,
    rebuyOpen: running && index < t.rebuyLevels,
    rebuyEndsAt: started ? rebuyEndsAt(t) : null,
    lateRegOpen: t.status === 'registering' || (running && index < t.lateRegLevels),
    lateRegEndsAt: lateEnd,
  }
}

function placeOf(st: State, s: Seat, place: number): TournamentPlace {
  const t = st.tournament as Tournament
  return { userId: s.userId, name: s.name, avatar: s.avatar, place, entries: t.entries[s.userId] ?? 1 }
}

/** Knocks out the given seats together: the one who started the hand with less gets the worse place. */
function eliminate(st: State, seats: { i: number; at: number; start: number }[]): void {
  const t = st.tournament as Tournament
  const order = [...seats].sort((a, b) => a.at - b.at || a.start - b.start || a.i - b.i)
  for (const e of order) {
    const s = seatAt(st, e.i)
    if (s === null) continue
    const remaining = st.seats.filter((x) => x !== null).length
    t.out.push(placeOf(st, s, remaining))
    delete t.busted[s.userId]
    st.seats[e.i] = null
  }
  checkWinner(st)
}

/** One player left: the tournament is over and the table closes (the results stay in the public view). */
function checkWinner(st: State): void {
  const t = st.tournament as Tournament
  const left = st.seats.flatMap((s) => (s === null ? [] : [s]))
  if (t.status !== 'running' || left.length !== 1) return
  t.winner = placeOf(st, left[0] as Seat, 1)
  t.status = 'finished'
  st.phase = 'waiting'
  st.nextAt = null
  st.closed = true
}

/** Players with no chips: wait for a rebuy while it is allowed (up to rebuyDecideMs), otherwise they are out. */
function settleBusts(st: State, ctx: Ctx): void {
  const t = st.tournament as Tournament
  const net = st.hand?.result?.net ?? {}
  const open = tournamentClock(t, ctx.now).rebuyOpen
  const out: { i: number; at: number; start: number }[] = []
  st.seats.forEach((s, i) => {
    if (s === null) return
    if (s.stack > 0) {
      delete t.busted[s.userId]
      return
    }
    let b = t.busted[s.userId]
    if (b === undefined) {
      b = { at: ctx.now, start: -(net[String(i)] ?? 0) }
      t.busted[s.userId] = b
    }
    if (!open || ctx.now >= b.at + t.rebuyDecideMs) out.push({ i, at: b.at, start: b.start })
  })
  if (out.length > 0) eliminate(st, out)
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
  /** 7-2 house-rule payments: the winner and what every other seated player paid. */
  bonus?: SevenDeuce[]
  /** Seat index -> chips won or lost in this hand (pot and 7-2 bonus together). */
  net?: Record<string, number>
}

export interface SevenDeuce {
  seat: number
  total: number
  /** Seat index -> chips paid. */
  from: Record<string, number>
}

/** Seven and deuce, any suits. */
export function isSevenDeuce(cards: readonly Card[] | undefined): boolean {
  if (cards === undefined || cards.length !== 2) return false
  const r = cards.map((c) => c.charAt(0)).sort().join('')
  return r === '27'
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
  /** Null (or missing in older states) at a cash table. */
  tournament?: Tournament | null
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
  /** Tournament: the opener starts it. */
  | { type: 'start' }
  /** Tournament: out of chips and done (no rebuy). */
  | { type: 'bust' }

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

export function createState(
  ownerId: string,
  config: Config = DEFAULT_CONFIG,
  opts: { tournament?: Partial<TournamentConfig> } = {},
): State {
  let tournament: Tournament | null = null
  if (opts.tournament !== undefined) {
    tournament = {
      ...DEFAULT_TOURNAMENT,
      ...opts.tournament,
      status: 'registering',
      startedAt: null,
      entries: {},
      busted: {},
      out: [],
      winner: null,
    }
    const first = levelNo(tournament, 0)
    // Rebuy only with no chips left; blinds come from the level.
    config = { ...config, sb: first.sb, bb: first.bb, rebuyBelow: 1, minPlayers: 2 }
  }
  return {
    tournament,
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

/** In a running tournament players who sit out are still dealt in (and blinded off); at a cash table they are not. */
const dealer = (st: State) => (s: Seat): boolean =>
  (!s.sittingOut || runningTournament(st)) && !s.leaving && s.stack > 0

function countDealable(st: State): number {
  const canDeal = dealer(st)
  return st.seats.filter((s) => s !== null && canDeal(s)).length
}

const runningTournament = (st: State): boolean => st.tournament?.status === 'running'

/** Who acts next and until when. A player who sits out (tournament) times out at once. */
function setTurn(st: State, ctx: Ctx, idx: number): void {
  const h = st.hand as Hand
  h.toAct = idx
  const s = seatAt(st, idx)
  h.deadline = s !== null && s.sittingOut ? ctx.now : ctx.now + st.config.turnMs
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
  // A tournament starts only when its opener presses start.
  if (st.tournament && st.tournament.status !== 'running') return
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
  const t = st.tournament
  if (t && t.status === 'running') {
    const level = levelAt(t, ctx.now)
    st.config.sb = level.sb
    st.config.bb = level.bb
    settleBusts(st, ctx)
    if (t.status !== 'running') return
    if (countDealable(st) < st.config.minPlayers) {
      // Someone is still deciding on a rebuy: wait for them (or for their time to run out).
      const ends = Object.values(t.busted).map((b) => b.at + t.rebuyDecideMs)
      ends.push(rebuyEndsAt(t))
      st.phase = 'between'
      st.nextAt = Math.max(ctx.now + 1, Math.min(...ends))
      st.hand = null
      return
    }
  }
  const canDeal = dealer(st)
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
    setTurn(st, ctx, next)
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
  setTurn(st, ctx, nextToAct(st, h.button))
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
  const net: Record<string, number> = {}
  st.seats.forEach((s, i) => {
    if (s !== null && s.inHand) net[String(i)] = (result.won[String(i)] ?? 0) - s.committed
  })
  result.net = net
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
  // House rule: a pot won with 7-2 earns a bonus from everybody seated (whatever they have, up to the bonus).
  // The cards are shown to the table even when nobody called.
  const bonus = st.config.sevenDeuceBonus ?? DEFAULT_CONFIG.sevenDeuceBonus
  if (bonus > 0) {
    for (const key of Object.keys(result.won)) {
      const w = Number(key)
      if ((result.won[key] ?? 0) <= 0 || !isSevenDeuce(h.hole[key])) continue
      const winner = mustSeat(st, w)
      const entry: SevenDeuce = { seat: w, total: 0, from: {} }
      st.seats.forEach((s, i) => {
        if (s === null || i === w) return
        const pay = Math.min(bonus, s.stack)
        if (pay <= 0) return
        s.stack -= pay
        entry.from[String(i)] = pay
        entry.total += pay
        net[String(i)] = (net[String(i)] ?? 0) - pay
      })
      winner.stack += entry.total
      net[String(w)] = (net[String(w)] ?? 0) + entry.total
      winner.shown = true
      ;(result.bonus ??= []).push(entry)
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

    case 'start': {
      const t = st.tournament
      if (!t || t.status !== 'registering') fail('ILLEGAL_ACTION')
      if (userId !== st.ownerId && ctx.isAdmin !== true) fail('NOT_ALLOWED')
      if (st.seats.filter((s) => s !== null).length < 2) fail('NEED_PLAYERS')
      t.status = 'running'
      t.startedAt = ctx.now
      const first = levelNo(t, 0)
      st.config.sb = first.sb
      st.config.bb = first.bb
      st.phase = 'waiting'
      maybeStart(st, ctx)
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
      const tour = st.tournament
      if (tour) {
        if (tour.out.some((o) => o.userId === userId)) fail('ELIMINATED')
        if (!tournamentClock(tour, ctx.now).lateRegOpen) fail('REG_CLOSED')
        delete st.ledger[userId]
        tour.entries[userId] = 1
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
      if (st.tournament && st.tournament.status !== 'finished') st.tournament.status = 'cancelled'
      return st
    }
  }

  if (idx < 0) fail('NOT_SEATED')
  const s = mustSeat(st, idx)
  const h = st.hand

  const tour = st.tournament ?? null
  switch (action.type) {
    case 'leave': {
      if (tour && tour.status === 'registering') {
        // Not started yet: leaving cancels the registration.
        st.seats[idx] = null
        delete tour.entries[userId]
        return st
      }
      if (tour) {
        // Running tournament: the seat and the chips stay (blinded off) until the player comes back.
        s.sittingOut = true
        s.sitOutNext = false
        if (st.phase === 'hand' && h !== null && h.toAct === idx) h.deadline = ctx.now
        return st
      }
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
      if (s.stack >= (st.config.rebuyBelow ?? 1)) fail('HAS_CHIPS')
      if (st.phase === 'hand' && s.inHand && !s.folded) fail('ILLEGAL_ACTION')
      if (tour) {
        if (!tournamentClock(tour, ctx.now).rebuyOpen) fail('REBUY_CLOSED')
        tour.entries[userId] = (tour.entries[userId] ?? 1) + 1
        delete tour.busted[userId]
      }
      s.stack += st.config.buyin
      s.bought += st.config.buyin
      if (tour && st.phase === 'between' && st.hand === null && countDealable(st) >= st.config.minPlayers) {
        // The table was waiting for this rebuy: deal soon.
        st.nextAt = Math.min(st.nextAt ?? Infinity, ctx.now + st.config.startMs)
      }
      maybeStart(st, ctx)
      return st
    }

    case 'bust': {
      if (!tour || tour.status !== 'running' || s.stack > 0) fail('ILLEGAL_ACTION')
      if (st.phase === 'hand' && s.inHand && !s.folded) fail('ILLEGAL_ACTION')
      const b = tour.busted[userId]
      eliminate(st, [{ i: idx, at: b?.at ?? ctx.now, start: b?.start ?? 0 }])
      if (!st.closed && st.phase === 'between' && st.hand === null && countDealable(st) >= st.config.minPlayers) {
        st.nextAt = Math.min(st.nextAt ?? Infinity, ctx.now + st.config.startMs)
      }
      return st
    }

    case 'sit_out': {
      if (tour) {
        // Tournament: dealt in anyway, every decision times out at once.
        s.sittingOut = true
        if (st.phase === 'hand' && h !== null && h.toAct === idx) h.deadline = ctx.now
        return st
      }
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
  /** Null at a cash table. All of it is public (levels, who is out and in which place). */
  tournament: Tournament | null
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
    tournament: st.tournament ? (JSON.parse(JSON.stringify(st.tournament)) as Tournament) : null,
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

export interface HandSummaryPlayer {
  userId: string
  name: string
  /** Chips won (+) or lost (-) in the hand, 7-2 bonus included. */
  net: number
  won: boolean
  /** Hand name at a showdown. */
  label: string | null
  /** Face-up cards only (showdown, Show or 7-2); never cards nobody saw. */
  cards: Card[] | null
  sevenDeuce: boolean
}

export interface HandSummary {
  handNo: number
  board: Card[]
  pot: number
  showdown: boolean
  /** 7-2 bonus collected in this hand (0 when none). */
  bonus: number
  players: HandSummaryPlayer[]
}

/** The finished hand as it goes into the history: public information only. Null while no hand has ended. */
export function handSummary(st: State): HandSummary | null {
  const h = st.hand
  const r = h?.result
  if (!h || !r) return null
  const players: HandSummaryPlayer[] = []
  const bonusBySeat = new Map((r.bonus ?? []).map((b) => [b.seat, b.total]))
  st.seats.forEach((s, i) => {
    const key = String(i)
    const net = r.net?.[key]
    if (s === null || net === undefined) return
    players.push({
      userId: s.userId,
      name: s.name,
      net,
      won: (r.won[key] ?? 0) > 0,
      label: r.labels[key] ?? null,
      cards: s.shown ? [...(h.hole[key] ?? [])] : null,
      sevenDeuce: bonusBySeat.has(i),
    })
  })
  return {
    handNo: h.no,
    board: [...h.board],
    pot: r.total,
    showdown: r.showdown,
    bonus: (r.bonus ?? []).reduce((sum, b) => sum + b.total, 0),
    players,
  }
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

/**
 * Deterministic self-check: plays `hands` hands of random legal poker with a seeded generator and returns a
 * fingerprint. A deployed copy of this file must return the same fingerprint as the tested source.
 */
export function seededRand(seed: number): Rand {
  let a = seed >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

/** Random legal move for the player to act (used by the self-checks and tests). */
export function randomMove(st: State, rand: Rand): Action {
  const h = st.hand as Hand
  const opts = turnOptions(st, h.toAct as number)
  const roll = rand(100)
  if (roll < 10 && !opts.canCheck) return { type: 'fold' }
  if (roll < 32 && opts.canRaise) return { type: 'raise', to: opts.minTo + st.config.unit * rand((opts.maxTo - opts.minTo) / st.config.unit + 1) }
  return opts.canCheck ? { type: 'check' } : { type: 'call' }
}

/**
 * Plays a whole tournament (short levels) with random moves, random rebuys and "done" presses.
 * Returns the final state and the number of steps.
 */
export function playTournament(seed: number, players: number, maxSteps = 200_000): { st: State; steps: number; digest: number } {
  const rand = seededRand(seed)
  let now = 1_000_000
  let st = createState('u0', DEFAULT_CONFIG, { tournament: { levelMs: 60_000, rebuyDecideMs: 10_000 } })
  for (let i = 0; i < players; i++) st = applyAction(st, `u${i}`, { type: 'sit' }, { now, rand, profile: { name: `P${i}`, avatar: null } })
  st = applyAction(st, 'u0', { type: 'start' }, { now, rand })
  let steps = 0
  let digest = 0
  while (!st.closed && steps < maxSteps) {
    steps++
    now += 500
    const h = st.hand
    if (st.phase === 'hand' && h !== null && h.toAct !== null && h.toAct >= 0) {
      st = applyAction(st, mustSeat(st, h.toAct).userId, randomMove(st, rand), { now, rand })
    } else {
      const t = st.tournament as Tournament
      for (const s of st.seats) {
        if (s === null || s.stack > 0 || st.closed) continue
        const roll = rand(10)
        if (roll < 3 && tournamentClock(t, now).rebuyOpen) st = applyAction(st, s.userId, { type: 'rebuy' }, { now, rand })
        else if (roll === 9) st = applyAction(st, s.userId, { type: 'bust' }, { now, rand })
      }
      if (st.closed) break
      now = Math.max(now, st.nextAt ?? now)
      st = applyAction(st, 'u0', { type: 'tick' }, { now, rand })
    }
    for (const s of st.seats) if (s !== null) digest = (Math.imul(digest, 31) + s.stack + 3 * s.bet) >>> 0
  }
  return { st, steps, digest }
}

export function selfCheck(seed: number, hands: number): string {
  const rand = seededRand(seed)
  let st = createState('u0')
  let now = 1_000_000
  for (let i = 0; i < 6; i++) st = applyAction(st, `u${i}`, { type: 'sit' }, { now, rand, profile: { name: `P${i}`, avatar: null } })
  let steps = 0
  let digest = 0
  while (st.handNo < hands && steps < 50_000) {
    steps++
    now += 500
    const h = st.hand
    if (st.phase === 'hand' && h !== null && h.toAct !== null) {
      st = applyAction(st, mustSeat(st, h.toAct).userId, randomMove(st, rand), { now, rand })
    } else {
      for (const s of st.seats) if (s !== null && s.stack === 0) st = applyAction(st, s.userId, { type: 'rebuy' }, { now, rand })
      now = Math.max(now, st.nextAt ?? now)
      st = applyAction(st, 'u0', { type: 'tick' }, { now, rand })
    }
    for (const s of st.seats) if (s !== null) digest = (Math.imul(digest, 31) + s.stack + 7 * s.bet + (s.folded ? 3 : 0)) >>> 0
    digest = (Math.imul(digest, 31) + (st.hand?.board.length ?? 0) + (st.hand?.toAct ?? -1) + 1) >>> 0
  }
  const tour = playTournament(seed, 5)
  const tt = tour.st.tournament as Tournament
  const places = tt.out.map((o) => `${o.userId}#${o.place}x${o.entries}`).join(',')
  return (
    `${st.handNo}:${steps}:${digest}:${st.seats.map((s) => (s === null ? '-' : `${s.stack}/${s.bought}`)).join(',')}` +
    `|T:${tour.st.handNo}:${tour.steps}:${tour.digest}:${tt.winner?.userId ?? '-'}:${places}`
  )
}
