import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applyAction,
  cardsOf,
  chipBreakdown,
  compareScore,
  createState,
  describeCards,
  evaluate,
  freshDeck,
  HoldemError,
  holeByUser,
  isSevenDeuce,
  publicView,
  scoreLabel,
  selfCheck,
  shuffledDeck,
  type Action,
  type Card,
  type Ctx,
  type Rand,
  type State,
} from './engine'

const T0 = 1_000_000

function seeded(seed: number): Rand {
  let a = seed >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

const zero: Rand = () => 0
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: T0, rand: zero, ...over })
const cards = (s: string): Card[] => s.split(' ')

/** A deck whose first dealt cards are `first` (in dealing order). */
function stacked(first: string): Card[] {
  const want = cards(first)
  const rest = freshDeck().filter((c) => !want.includes(c))
  return [...rest, ...[...want].reverse()]
}

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof HoldemError) return err.code
    throw err
  }
  return 'OK'
}

/** `n` players at seats 0..n-1 (users u0, u1, ...), not started yet. */
function seated(n: number, stacks?: number[]): State {
  let st = createState('u0')
  for (let i = 0; i < n; i++) {
    st = applyAction(st, `u${i}`, { type: 'sit', seat: i }, ctx({ profile: { name: `P${i}`, avatar: null } }))
  }
  if (stacks) stacks.forEach((v, i) => ((st.seats[i] as NonNullable<State['seats'][number]>).stack = v))
  return st
}

/** Starts the first hand (button = seat 0 because rand is 0). */
function started(n: number, deck?: string, stacks?: number[]): State {
  const st = seated(n, stacks)
  return applyAction(st, 'u0', { type: 'tick' }, ctx({ now: T0 + 60_000, deck: deck ? stacked(deck) : undefined }))
}

const act = (st: State, seat: number, action: Action, over: Partial<Ctx> = {}): State =>
  applyAction(st, `u${seat}`, action, ctx({ now: T0 + 61_000, ...over }))

const seat = (st: State, i: number) => st.seats[i] as NonNullable<State['seats'][number]>
const hand = (st: State) => st.hand as NonNullable<State['hand']>

function totalChips(st: State): { chips: number; bought: number } {
  let chips = 0
  let bought = 0
  for (const s of st.seats) {
    if (s === null) continue
    chips += s.stack + s.committed
    bought += s.bought
  }
  for (const e of Object.values(st.ledger)) {
    chips += e.stack
    bought += e.bought
  }
  return { chips, bought }
}

describe('hand evaluation', () => {
  const score = (s: string) => evaluate(cards(s)).score

  it('ranks the categories in order', () => {
    const ladder = [
      'Ah Kd 9c 7s 3d', // high card
      'Ah Ad 9c 7s 3d', // pair
      'Ah Ad 9c 9s 3d', // two pair
      'Ah Ad Ac 7s 3d', // trips
      '5h 6d 7c 8s 9d', // straight
      'Ah Jh 9h 7h 3h', // flush
      'Ah Ad Ac 7s 7d', // full house
      'Ah Ad Ac As 3d', // quads
      '5h 6h 7h 8h 9h', // straight flush
    ].map(score)
    for (let i = 1; i < ladder.length; i++) {
      expect(compareScore(ladder[i] as number[], ladder[i - 1] as number[])).toBeGreaterThan(0)
    }
  })

  it('treats A-2-3-4-5 as the lowest straight', () => {
    expect(score('Ah 2d 3c 4s 5d')).toEqual([4, 3])
    expect(compareScore(score('2h 3d 4c 5s 6d'), score('Ah 2d 3c 4s 5d'))).toBeGreaterThan(0)
  })

  it('breaks ties with kickers', () => {
    expect(compareScore(score('Ah Ad Kc 7s 3d'), score('As Ac Qc 7d 3h'))).toBeGreaterThan(0)
    expect(compareScore(score('Ah Ad Kc 7s 3d'), score('As Ac Kd 7d 3h'))).toBe(0)
  })

  it('picks the best five of seven', () => {
    const ev = evaluate(cards('Ah Kh 2c Qh Jh Th 2d'))
    expect(ev.score).toEqual([8, 12])
    expect(scoreLabel(ev.score)).toBe('רויאל פלאש')
    expect(ev.best).toHaveLength(5)
  })

  it('names hands in Hebrew', () => {
    expect(describeCards(cards('Kh Kd'))).toBe('זוג K')
    expect(describeCards(cards('Kh 9d'))).toBe('K גבוה')
    expect(describeCards(cards('Kh 4d Ks 4c 9h'))).toBe('שני זוגות K/4')
    expect(describeCards(cards('Th 4d Ts 4c Td 2s 3s'))).toBe('פול האוס 10/4')
    expect(describeCards([])).toBe('')
  })

  it('shuffles a full, unique deck', () => {
    const deck = shuffledDeck(seeded(7))
    expect(deck).toHaveLength(52)
    expect(new Set(deck).size).toBe(52)
    expect(deck).not.toEqual(freshDeck())
  })
})

describe('sitting down and starting', () => {
  it('gives 250 chips and starts once two players sit', () => {
    let st = createState('u0')
    st = applyAction(st, 'u0', { type: 'sit' }, ctx({ profile: { name: 'A', avatar: null } }))
    expect(st.phase).toBe('waiting')
    expect(seat(st, 0)).toMatchObject({ stack: 250, bought: 250, name: 'A' })
    st = applyAction(st, 'u1', { type: 'sit' }, ctx())
    expect(st.phase).toBe('between')
    expect(st.nextAt).toBe(T0 + st.config.startMs)
  })

  it('rejects a taken seat, a second seat and a bad seat number', () => {
    const st = seated(2)
    expect(code(() => applyAction(st, 'u5', { type: 'sit', seat: 0 }, ctx()))).toBe('SEAT_TAKEN')
    expect(code(() => applyAction(st, 'u0', { type: 'sit', seat: 5 }, ctx()))).toBe('ALREADY_SEATED')
    expect(code(() => applyAction(st, 'u5', { type: 'sit', seat: 10 }, ctx()))).toBe('INVALID_SEAT')
    expect(code(() => applyAction(st, 'u5', { type: 'fold' }, ctx()))).toBe('NOT_SEATED')
  })

  it('seats up to ten players and then the table is full', () => {
    const st = seated(10)
    expect(st.seats.every((s) => s !== null)).toBe(true)
    expect(code(() => applyAction(st, 'u10', { type: 'sit' }, ctx()))).toBe('TABLE_FULL')
  })

  it('a tick before the start time changes nothing', () => {
    const st = seated(2)
    expect(applyAction(st, 'u0', { type: 'tick' }, ctx({ now: T0 + 10 }))).toBe(st)
  })
})

describe('a heads-up hand', () => {
  it('posts 5/5 blinds, the button acts first before the flop', () => {
    const st = started(2)
    const h = hand(st)
    expect(st.phase).toBe('hand')
    expect(h).toMatchObject({ no: 1, button: 0, sb: 0, bb: 1, toAct: 0, currentBet: 5, street: 0 })
    expect(seat(st, 0)).toMatchObject({ stack: 245, bet: 5, last: 'sb' })
    expect(seat(st, 1)).toMatchObject({ stack: 245, bet: 5, last: 'bb' })
    expect(h.deadline).toBe(T0 + 60_000 + st.config.turnMs)
    expect(publicView(st, 1).hand?.pot).toBe(10)
  })

  it('checks down to a showdown and pays the best hand', () => {
    // seat 1 is dealt first (As Ah), then seat 0 (Kc Kd); board 2c 7d 9h 3s 4d
    let st = started(2, 'As Ah Kc Kd 2c 7d 9h 3s 4d')
    expect(code(() => act(st, 0, { type: 'call' }))).toBe('ILLEGAL_ACTION')
    expect(code(() => act(st, 1, { type: 'check' }))).toBe('NOT_YOUR_TURN')
    st = act(st, 0, { type: 'check' })
    st = act(st, 1, { type: 'check' })
    expect(hand(st).board).toEqual(cards('2c 7d 9h'))
    expect(hand(st).toAct).toBe(1) // after the flop the non-button acts first
    for (let street = 0; street < 3; street++) {
      st = act(st, 1, { type: 'check' })
      st = act(st, 0, { type: 'check' })
    }
    const h = hand(st)
    expect(st.phase).toBe('between')
    expect(h.board).toEqual(cards('2c 7d 9h 3s 4d'))
    expect(h.result).toMatchObject({ showdown: true, total: 10, won: { '1': 10 }, labels: { '0': 'זוג K', '1': 'זוג A' } })
    expect(seat(st, 1).stack).toBe(255)
    expect(seat(st, 0).stack).toBe(245)
    const pub = publicView(st, 5)
    expect(pub.seats[0]?.cards).toEqual(cards('Kc Kd'))
    expect(pub.seats[1]?.cards).toEqual(cards('As Ah'))
    expect(st.nextAt).toBe(T0 + 61_000 + st.config.showdownMs)
  })

  it('a fold ends the hand, returns the uncalled bet and shows no cards', () => {
    let st = started(2, 'As Ah Kc Kd')
    st = act(st, 0, { type: 'raise', to: 20 })
    expect(seat(st, 0)).toMatchObject({ bet: 20, stack: 230, last: 'raise' })
    st = act(st, 1, { type: 'fold' })
    expect(hand(st).result).toMatchObject({ showdown: false, total: 10, won: { '0': 10 } })
    expect(seat(st, 0).stack).toBe(255)
    expect(seat(st, 1).stack).toBe(245)
    const pub = publicView(st, 1)
    expect(pub.seats[0]?.cards).toBeNull()
    expect(pub.seats[1]?.cards).toBeNull()
    expect(st.nextAt).toBe(T0 + 61_000 + st.config.foldWinMs)
  })

  it('Show reveals the cards of a player who asks for it after the hand', () => {
    let st = started(2, 'As Ah Kc Kd')
    expect(code(() => act(st, 1, { type: 'show' }))).toBe('ILLEGAL_ACTION')
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'fold' })
    st = act(st, 1, { type: 'show' })
    const pub = publicView(st, 1)
    expect(pub.seats[1]?.cards).toEqual(cards('As Ah'))
    expect(pub.seats[0]?.cards).toBeNull()
  })

  it('moves the button and starts the next hand on the tick', () => {
    let st = started(2)
    st = act(st, 0, { type: 'fold' })
    const early = applyAction(st, 'u0', { type: 'tick' }, ctx({ now: (st.nextAt as number) - 1 }))
    expect(early).toBe(st)
    st = applyAction(st, 'u0', { type: 'tick' }, ctx({ now: st.nextAt as number }))
    expect(hand(st)).toMatchObject({ no: 2, button: 1, sb: 1, bb: 0, toAct: 1 })
    expect(seat(st, 0).last).toBe('bb')
  })
})

describe('betting rules', () => {
  it('enforces the minimum raise and the 5-chip unit', () => {
    let st = started(2)
    expect(code(() => act(st, 0, { type: 'raise', to: 7 }))).toBe('BAD_AMOUNT')
    expect(code(() => act(st, 0, { type: 'raise', to: 5 }))).toBe('BAD_AMOUNT')
    expect(code(() => act(st, 0, { type: 'raise', to: 255 }))).toBe('BAD_AMOUNT')
    st = act(st, 0, { type: 'raise', to: 20 }) // a raise of 15
    expect(publicView(st, 1).hand?.options).toMatchObject({ toCall: 15, canCheck: false, canRaise: true, minTo: 35, maxTo: 250 })
    expect(code(() => act(st, 1, { type: 'raise', to: 30 }))).toBe('BAD_AMOUNT')
    expect(code(() => act(st, 1, { type: 'check' }))).toBe('ILLEGAL_ACTION')
    st = act(st, 1, { type: 'raise', to: 35 })
    expect(hand(st)).toMatchObject({ currentBet: 35, minRaise: 15, toAct: 0 })
  })

  it('the big blind gets the option to raise after a limp', () => {
    let st = started(3)
    // button 0, sb 1, bb 2; seat 0 is first to act
    expect(hand(st)).toMatchObject({ sb: 1, bb: 2, toAct: 0 })
    st = act(st, 0, { type: 'call' })
    st = act(st, 1, { type: 'check' })
    expect(hand(st).toAct).toBe(2)
    expect(publicView(st, 1).hand?.options).toMatchObject({ canCheck: true, canRaise: true, minTo: 10 })
    st = act(st, 2, { type: 'check' })
    expect(hand(st).street).toBe(1)
    expect(hand(st).toAct).toBe(1) // first seat after the button
  })

  it('a short all-in does not re-open the betting for players who already acted', () => {
    let st = started(3, undefined, [250, 250, 30])
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'call' })
    st = act(st, 2, { type: 'raise', to: 30 }) // all-in, only 10 more: not a full raise
    expect(seat(st, 2)).toMatchObject({ allIn: true, stack: 0, last: 'allin' })
    expect(hand(st)).toMatchObject({ toAct: 0, currentBet: 30, minRaise: 15 })
    expect(publicView(st, 1).hand?.options).toMatchObject({ toCall: 10, canRaise: false })
    expect(code(() => act(st, 0, { type: 'raise', to: 60 }))).toBe('ILLEGAL_ACTION')
    st = act(st, 0, { type: 'call' })
    st = act(st, 1, { type: 'call' })
    expect(hand(st).street).toBe(1)
    expect(publicView(st, 1).hand?.pot).toBe(90)
  })

  it('builds side pots and returns the part nobody could call', () => {
    // dealing order: seat 1 (As Ah), seat 2 (Kc Kd), seat 0 (Qc Qd)
    let st = started(3, 'As Ah Kc Kd Qc Qd 2c 7d 9h 3s 4d', [250, 50, 150])
    st = act(st, 0, { type: 'raise', to: 250 })
    st = act(st, 1, { type: 'call' })
    st = act(st, 2, { type: 'call' })
    const r = hand(st).result
    expect(st.phase).toBe('between')
    expect(hand(st).board).toHaveLength(5)
    expect(r?.pots).toEqual([
      { amount: 150, winners: [1] },
      { amount: 200, winners: [2] },
    ])
    expect(seat(st, 1).stack).toBe(150)
    expect(seat(st, 2).stack).toBe(200)
    expect(seat(st, 0).stack).toBe(100)
    expect(totalChips(st).chips).toBe(450)
  })

  it('splits a tied pot and gives the odd chip to the first seat after the button', () => {
    // everyone plays the board: A K Q J T
    let st = started(3, '2c 3d 2h 3s 4c 4d As Kd Qh Jc Ts')
    st = act(st, 0, { type: 'call' })
    st = act(st, 1, { type: 'check' })
    st = act(st, 2, { type: 'check' })
    st = act(st, 1, { type: 'check' })
    st = act(st, 2, { type: 'check' })
    st = act(st, 0, { type: 'fold' })
    for (let i = 0; i < 2; i++) {
      st = act(st, 1, { type: 'check' })
      st = act(st, 2, { type: 'check' })
    }
    expect(hand(st).result).toMatchObject({ total: 15, won: { '1': 10, '2': 5 } })
    expect(hand(st).result?.pots).toEqual([{ amount: 15, winners: [1, 2] }])
  })

  it('runs the board out when everyone is all-in', () => {
    let st = started(2, 'As Ah Kc Kd 2c 7d 9h 3s 4d')
    st = act(st, 0, { type: 'raise', to: 250 })
    st = act(st, 1, { type: 'call' })
    expect(hand(st).board).toHaveLength(5)
    expect(seat(st, 1).stack).toBe(500)
    expect(seat(st, 0).stack).toBe(0)
    // the loser needs a rebuy; with one player holding chips the table waits
    st = applyAction(st, 'u0', { type: 'tick' }, ctx({ now: st.nextAt as number }))
    expect(st.phase).toBe('waiting')
  })
})

describe('timer and sitting out', () => {
  it('checks when possible and folds when facing a bet', () => {
    let st = started(2)
    const deadline = hand(st).deadline as number
    expect(applyAction(st, 'u1', { type: 'tick' }, ctx({ now: deadline - 1 }))).toBe(st)
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now: deadline }))
    expect(seat(st, 0)).toMatchObject({ last: 'check', timedOut: true, folded: false })
    st = applyAction(st, 'u1', { type: 'raise', to: 20 }, ctx({ now: deadline + 1 }))
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now: deadline + 1 + st.config.turnMs }))
    expect(seat(st, 0).folded).toBe(true)
    expect(hand(st).result?.won).toEqual({ '1': 10 })
  })

  it('sits a player out after two hands in a row without a response, keeping the seat and the chips', () => {
    let st = started(2)
    let now = T0 + 60_000
    const playHand = (): void => {
      // seat 0 never answers; seat 1 always checks
      while (st.phase === 'hand') {
        const h = hand(st)
        now = Math.max(now, h.deadline as number)
        if (h.toAct === 1) st = applyAction(st, 'u1', { type: 'check' }, ctx({ now }))
        else st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now }))
      }
    }
    playHand()
    expect(seat(st, 0)).toMatchObject({ missed: 1, sittingOut: false })
    now = st.nextAt as number
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now }))
    playHand()
    expect(seat(st, 0)).toMatchObject({ sittingOut: true, missed: 0 })
    const stackBefore = seat(st, 0).stack
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now: st.nextAt as number }))
    expect(st.phase).toBe('waiting')
    const pub = publicView(st, 1)
    expect(pub.seats[0]).toMatchObject({ sittingOut: true, stack: stackBefore, inHand: false })
    // coming back starts the game again
    st = applyAction(st, 'u0', { type: 'sit_in' }, ctx({ now: now + 99_000 }))
    expect(st.phase).toBe('between')
    expect(seat(st, 0).sittingOut).toBe(false)
  })

  it('a voluntary action resets the missed counter', () => {
    let st = started(2)
    seat(st, 0).missed = 1
    st = act(st, 0, { type: 'fold' })
    expect(seat(st, 0).missed).toBe(0)
  })

  it('sitting out during a hand takes effect when the hand ends; players sitting out post no blinds', () => {
    let st = started(3)
    st = act(st, 0, { type: 'sit_out' })
    expect(seat(st, 0)).toMatchObject({ sittingOut: false, sitOutNext: true })
    st = act(st, 0, { type: 'fold' })
    st = act(st, 1, { type: 'fold' })
    expect(seat(st, 0).sittingOut).toBe(true)
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now: st.nextAt as number }))
    expect(seat(st, 0)).toMatchObject({ inHand: false, stack: 250 })
    expect(Object.keys(hand(st).hole).sort()).toEqual(['1', '2'])
  })
})

describe('chips: rebuy, leaving, closing', () => {
  it('allows a rebuy only when the chips are gone', () => {
    let st = started(2, 'As Ah Kc Kd 2c 7d 9h 3s 4d')
    expect(code(() => act(st, 0, { type: 'rebuy' }))).toBe('HAS_CHIPS')
    st = act(st, 0, { type: 'raise', to: 250 })
    st = act(st, 1, { type: 'call' })
    st = act(st, 0, { type: 'rebuy' })
    expect(seat(st, 0)).toMatchObject({ stack: 250, bought: 500 })
    expect(code(() => act(st, 0, { type: 'rebuy' }))).toBe('HAS_CHIPS')
    expect(totalChips(st)).toEqual({ chips: 750, bought: 750 })
  })

  it('keeps the chips of a player who leaves and returns', () => {
    let st = seated(1)
    seat(st, 0).stack = 410
    st = applyAction(st, 'u0', { type: 'leave' }, ctx())
    expect(st.seats[0]).toBeNull()
    expect(st.ledger.u0).toMatchObject({ stack: 410, bought: 250 })
    expect(publicView(st, 1).standings).toEqual([{ userId: 'u0', name: 'P0', avatar: null, bought: 250, stack: 410, seated: false }])
    st = applyAction(st, 'u0', { type: 'sit', seat: 4 }, ctx())
    expect(seat(st, 4)).toMatchObject({ stack: 410, bought: 250, name: 'P0' })
    expect(st.ledger.u0).toBeUndefined()
  })

  it('leaving on your turn folds; the seat is freed when the next hand starts', () => {
    let st = started(3)
    st = act(st, 0, { type: 'leave' })
    expect(seat(st, 0)).toMatchObject({ folded: true, leaving: true })
    expect(hand(st).toAct).toBe(1)
    st = act(st, 2, { type: 'leave' }) // out of turn: only one player is left
    expect(st.phase).toBe('between')
    expect(hand(st).result?.won).toEqual({ '1': 10 })
    st = applyAction(st, 'u1', { type: 'tick' }, ctx({ now: st.nextAt as number }))
    expect(st.seats[0]).toBeNull()
    expect(st.seats[2]).toBeNull()
    expect(st.phase).toBe('waiting')
    expect(totalChips(st)).toEqual({ chips: 750, bought: 750 })
  })

  it('only the owner or an admin can close; a running hand is refunded', () => {
    let st = started(2)
    st = act(st, 0, { type: 'raise', to: 50 })
    expect(code(() => act(st, 1, { type: 'close' }))).toBe('NOT_ALLOWED')
    const byAdmin = act(st, 1, { type: 'close' }, { isAdmin: true })
    expect(byAdmin.closed).toBe(true)
    st = act(st, 0, { type: 'close' })
    expect(st).toMatchObject({ closed: true, hand: null, phase: 'waiting' })
    expect(seat(st, 0).stack).toBe(250)
    expect(seat(st, 1).stack).toBe(250)
    expect(code(() => act(st, 0, { type: 'sit_in' }))).toBe('TABLE_CLOSED')
  })
})

describe('house rule: winning with 7-2', () => {
  /** Seats 0..n-1 seated, the listed seats sitting out, then the first hand (button 0). */
  function startedWithOut(n: number, out: number[], deck: string, stacks?: number[]): State {
    let st = seated(n, stacks)
    for (const i of out) st = applyAction(st, `u${i}`, { type: 'sit_out' }, ctx())
    return applyAction(st, 'u0', { type: 'tick' }, ctx({ now: T0 + 60_000, deck: stacked(deck) }))
  }

  it('recognises 7-2 in any suits and nothing else', () => {
    expect(isSevenDeuce(cards('7h 2d'))).toBe(true)
    expect(isSevenDeuce(cards('2s 7s'))).toBe(true)
    expect(isSevenDeuce(cards('7h 3d'))).toBe(false)
    expect(isSevenDeuce(undefined)).toBe(false)
  })

  it('pays 40 from every seated player when 7-2 wins a showdown', () => {
    // seat 1 gets 7h 2d, seat 0 gets Kc Qd; the board gives seat 1 a full house
    let st = started(2, '7h 2d Kc Qd 7c 7s 2h 3d 9c')
    st = act(st, 0, { type: 'check' })
    st = act(st, 1, { type: 'check' })
    for (let i = 0; i < 3; i++) {
      st = act(st, 1, { type: 'check' })
      st = act(st, 0, { type: 'check' })
    }
    const r = hand(st).result
    expect(r?.won).toEqual({ '1': 10 })
    expect(r?.bonus).toEqual([{ seat: 1, total: 40, from: { '0': 40 } }])
    expect(seat(st, 1).stack).toBe(255 + 40)
    expect(seat(st, 0).stack).toBe(245 - 40)
    expect(totalChips(st)).toEqual({ chips: 500, bought: 500 })
  })

  it('shows the 7-2 to everybody even when nobody called', () => {
    let st = started(2, 'As Ah 7c 2d')
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'fold' })
    expect(hand(st).result?.bonus).toEqual([{ seat: 0, total: 40, from: { '1': 40 } }])
    expect(publicView(st, 1).seats[0]?.cards).toEqual(cards('7c 2d'))
    expect(seat(st, 0).stack).toBe(255 + 40)
  })

  it('everyone seated pays, also a player sitting out; short stacks pay what they have', () => {
    // seat 2 sits out with 25 chips and is not dealt in
    let st = startedWithOut(3, [2], 'As Ah 7c 2d', [250, 250, 25])
    expect(Object.keys(hand(st).hole).sort()).toEqual(['0', '1'])
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'fold' })
    expect(hand(st).result?.bonus).toEqual([{ seat: 0, total: 65, from: { '1': 40, '2': 25 } }])
    expect(seat(st, 2).stack).toBe(0)
    expect(seat(st, 0).stack + seat(st, 1).stack + seat(st, 2).stack).toBe(250 + 250 + 25)
  })

  it('no bonus without 7-2, and none for 7-2 that lost', () => {
    let st = started(2, 'As Ah Kc Kd')
    st = act(st, 0, { type: 'fold' })
    expect(hand(st).result?.bonus).toBeUndefined()
    st = started(2, 'As Ah 7c 2d 9c 9d 4h 5s Jc')
    st = act(st, 0, { type: 'check' })
    st = act(st, 1, { type: 'check' })
    for (let i = 0; i < 3; i++) {
      st = act(st, 1, { type: 'check' })
      st = act(st, 0, { type: 'check' })
    }
    expect(hand(st).result?.won).toEqual({ '1': 10 })
    expect(hand(st).result?.bonus).toBeUndefined()
  })

  it('allows a rebuy below 40 chips between hands, not at 40', () => {
    let st = seated(2, [35, 250])
    st = applyAction(st, 'u0', { type: 'rebuy' }, ctx())
    expect(seat(st, 0)).toMatchObject({ stack: 285, bought: 500 })
    const at40 = seated(2, [40, 250])
    expect(code(() => applyAction(at40, 'u0', { type: 'rebuy' }, ctx()))).toBe('HAS_CHIPS')
  })
})

describe('what clients can see', () => {
  it('never exposes the deck or face-down cards', () => {
    const st = started(3, 'As Ah Kc Kd Qc Qd')
    const pub = publicView(st, 3)
    const json = JSON.stringify(pub)
    expect(json).not.toContain('"deck"')
    expect(json).not.toContain('"hole"')
    for (const c of cards('As Ah Kc Kd Qc Qd')) expect(json).not.toContain(c)
    expect(pub.seats[1]).toMatchObject({ hasCards: true, cards: null })
    expect(cardsOf(st, 'u1')).toEqual(cards('As Ah'))
    expect(cardsOf(st, 'nobody')).toBeNull()
    expect(holeByUser(st)).toEqual({ u1: cards('As Ah'), u2: cards('Kc Kd'), u0: cards('Qc Qd') })
  })

  it('breaks an amount into the fewest chips', () => {
    expect(chipBreakdown(340)).toEqual([250, 25, 25, 25, 10, 5])
    expect(chipBreakdown(140)).toEqual([100, 25, 10, 5])
    expect(chipBreakdown(250)).toEqual([250])
    expect(chipBreakdown(0)).toEqual([])
  })
})

describe('random play keeps every chip accounted for', () => {
  it.each([1, 2, 3, 4])('seed %i: 150 hands, 6 players', (seed) => {
    const rand = seeded(seed)
    let st = createState('u0')
    let now = T0
    for (let i = 0; i < 6; i++) st = applyAction(st, `u${i}`, { type: 'sit' }, { now, rand, profile: { name: `P${i}`, avatar: null } })
    let steps = 0
    while (st.handNo < 150 && steps < 60_000) {
      steps++
      now += 500
      const h = st.hand
      if (st.phase === 'hand' && h !== null && h.toAct !== null) {
        const idx = h.toAct
        const opts = publicView(st, 0).hand?.options
        if (!opts) throw new Error('no options')
        const roll = rand(100)
        let action: Action
        if (roll < 4) {
          now = h.deadline as number
          action = { type: 'tick' }
        } else if (roll < 14 && !opts.canCheck) action = { type: 'fold' }
        else if (roll < 34 && opts.canRaise) {
          const span = (opts.maxTo - opts.minTo) / 5
          action = { type: 'raise', to: opts.minTo + 5 * rand(span + 1) }
        } else action = opts.canCheck ? { type: 'check' } : { type: 'call' }
        st = applyAction(st, `u${idx}`, action, { now, rand })
      } else if (st.phase === 'between') {
        // between hands: some players show, rebuy, sit out or come back
        st.seats.forEach((s, i) => {
          if (s === null) return
          const r = rand(100)
          if (s.stack === 0) st = applyAction(st, s.userId, { type: 'rebuy' }, { now, rand })
          else if (r < 5 && !s.sittingOut) st = applyAction(st, s.userId, { type: 'sit_out' }, { now, rand })
          else if (r < 60 && s.sittingOut) st = applyAction(st, s.userId, { type: 'sit_in' }, { now, rand })
          else if (r < 12 && st.hand?.result && st.hand.hole[String(i)]) st = applyAction(st, s.userId, { type: 'show' }, { now, rand })
          else if (r === 99) st = applyAction(st, s.userId, { type: 'leave' }, { now, rand })
        })
        now = Math.max(now, st.nextAt ?? now)
        st = applyAction(st, 'u0', { type: 'tick' }, { now, rand })
      } else {
        // waiting: bring everyone back
        for (let i = 0; i < 6; i++) {
          const at = st.seats.findIndex((s) => s !== null && s.userId === `u${i}`)
          if (at < 0) st = applyAction(st, `u${i}`, { type: 'sit' }, { now, rand })
          else if (seat(st, at).stack === 0) st = applyAction(st, `u${i}`, { type: 'rebuy' }, { now, rand })
          else if (seat(st, at).sittingOut) st = applyAction(st, `u${i}`, { type: 'sit_in' }, { now, rand })
        }
      }
      const { chips, bought } = totalChips(st)
      expect(chips).toBe(bought)
      for (const s of st.seats) {
        if (s === null) continue
        expect(s.stack).toBeGreaterThanOrEqual(0)
        expect(s.stack % 5).toBe(0)
        expect(s.bet % 5).toBe(0)
      }
      const pub = publicView(st, steps)
      if (pub.hand?.toAct !== null && pub.hand?.toAct !== undefined) {
        expect(pub.seats[pub.hand.toAct]).toMatchObject({ inHand: true, folded: false, allIn: false })
      }
    }
    expect(st.handNo).toBe(150)
  })
})

describe('the edge function runs the same engine', () => {
  it('the self-check is deterministic (the deployed function must report this exact fingerprint)', () => {
    const print = selfCheck(11, 80)
    expect(print).toBe(selfCheck(11, 80))
    expect(print.startsWith('80:')).toBe(true)
    writeFileSync('node_modules/.holdem-selfcheck.txt', print)
  })

  it('supabase/functions/holdem/engine.ts is a verbatim copy', () => {
    const norm = (s: string): string => s.replace(/\r\n/g, '\n')
    const src = norm(readFileSync('src/lib/holdem/engine.ts', 'utf8'))
    const copy = norm(readFileSync('supabase/functions/holdem/engine.ts', 'utf8'))
    expect(copy).toBe(src)
  })
})
