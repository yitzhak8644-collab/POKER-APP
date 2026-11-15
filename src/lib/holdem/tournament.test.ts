import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createState,
  DEFAULT_CONFIG,
  HoldemError,
  levelNo,
  playTournament,
  publicView,
  tournamentClock,
  type Action,
  type Ctx,
  type Rand,
  type State,
  type Tournament,
} from './engine'

const T0 = 1_000_000
const MIN = 60_000
const zero: Rand = () => 0
const ctx = (now: number, over: Partial<Ctx> = {}): Ctx => ({ now, rand: zero, ...over })

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof HoldemError) return err.code
    throw err
  }
  return 'OK'
}

const tour = (st: State): Tournament => st.tournament as Tournament
const seat = (st: State, i: number) => st.seats[i] as NonNullable<State['seats'][number]>

/** A tournament with `n` registered players (u0 opened it), not started. */
function registered(n: number): State {
  let st = createState('u0', DEFAULT_CONFIG, { tournament: {} })
  for (let i = 0; i < n; i++) {
    st = applyAction(st, `u${i}`, { type: 'sit', seat: i }, ctx(T0, { profile: { name: `P${i}`, avatar: null } }))
  }
  return st
}

/** Started at T0 and the first hand dealt (button seat 0). */
function running(n: number): State {
  let st = applyAction(registered(n), 'u0', { type: 'start' }, ctx(T0))
  st = applyAction(st, 'u0', { type: 'tick' }, ctx(T0 + 5_000))
  return st
}

const act = (st: State, user: string, action: Action, now: number): State => applyAction(st, user, action, ctx(now))

/** Everybody folds to the big blind / the last bettor: ends the hand quickly. */
function foldOut(st: State, now: number): State {
  let s = st
  for (let k = 0; k < 20 && s.phase === 'hand' && s.hand?.toAct != null; k++) {
    s = act(s, seat(s, s.hand.toAct).userId, { type: 'fold' }, now)
  }
  return s
}

describe('tournament: start and blinds', () => {
  it('waits for the opener to press start, with at least two players', () => {
    let st = registered(1)
    expect(code(() => act(st, 'u0', { type: 'start' }, T0))).toBe('NEED_PLAYERS')
    st = registered(3)
    st = act(st, 'u0', { type: 'tick' }, T0 + 10 * MIN)
    expect(st.phase).toBe('waiting')
    expect(st.hand).toBeNull()
    expect(code(() => act(st, 'u1', { type: 'start' }, T0))).toBe('NOT_ALLOWED')
    st = running(3)
    expect(st.phase).toBe('hand')
    expect(seat(st, 0).stack + seat(st, 1).stack + seat(st, 2).stack + 5 + 5).toBe(750)
    expect(tour(st).status).toBe('running')
    expect(code(() => act(st, 'u0', { type: 'start' }, T0))).toBe('ILLEGAL_ACTION')
  })

  it('starts at 5/5 and raises the blinds every 10 minutes (from the next hand)', () => {
    let st = running(2)
    expect(st.config.sb).toBe(5)
    expect(st.config.bb).toBe(5)
    st = foldOut(st, T0 + 6_000)
    st = act(st, 'u0', { type: 'tick' }, T0 + 10 * MIN + 1)
    expect(st.phase).toBe('hand')
    expect(st.config.sb).toBe(5)
    expect(st.config.bb).toBe(10)
    expect(st.hand?.currentBet).toBe(10)
    st = foldOut(st, T0 + 10 * MIN + 2)
    st = act(st, 'u0', { type: 'tick' }, T0 + 35 * MIN)
    expect(st.config.bb).toBe(30)
    expect(st.config.sevenDeuceBonus).toBe(40)
  })

  it('doubles the last level after the list ends; the clock reports what comes next', () => {
    const st = running(2)
    const t = tour(st)
    expect(levelNo(t, 10)).toEqual({ sb: 300, bb: 600 })
    expect(levelNo(t, 11)).toEqual({ sb: 600, bb: 1200 })
    const c = tournamentClock(t, T0 + 25 * MIN)
    expect(c.index).toBe(2)
    expect(c.level).toEqual({ sb: 10, bb: 20 })
    expect(c.next).toEqual({ sb: 15, bb: 30 })
    expect(c.nextAt).toBe(T0 + 30 * MIN)
    expect(c.rebuyOpen).toBe(true)
    expect(c.lateRegOpen).toBe(false)
    expect(tournamentClock(t, T0 + 30 * MIN).rebuyOpen).toBe(false)
  })
})

describe('tournament: registration and rebuys', () => {
  it('late registration is open during the first level only, with 250 chips', () => {
    let st = running(2)
    st = applyAction(st, 'u5', { type: 'sit' }, ctx(T0 + 9 * MIN, { profile: { name: 'P5', avatar: null } }))
    const joined = st.seats.find((s) => s?.userId === 'u5')
    expect(joined?.stack).toBe(250)
    expect(tour(st).entries.u5).toBe(1)
    expect(code(() => applyAction(st, 'u6', { type: 'sit' }, ctx(T0 + 10 * MIN, { profile: { name: 'P6', avatar: null } })))).toBe(
      'REG_CLOSED',
    )
  })

  it('rebuy of 250 only with no chips and only during the first three levels', () => {
    const st = foldOut(running(3), T0 + 6_000)
    seat(st, 2).stack = 35
    expect(code(() => act(st, 'u2', { type: 'rebuy' }, T0 + 7_000))).toBe('HAS_CHIPS')
    seat(st, 2).stack = 0
    const after = act(st, 'u2', { type: 'rebuy' }, T0 + 7_000)
    expect(seat(after, 2).stack).toBe(250)
    expect(tour(after).entries.u2).toBe(2)
    expect(code(() => act(st, 'u2', { type: 'rebuy' }, T0 + 30 * MIN))).toBe('REBUY_CLOSED')
  })

  it('leaving before the start cancels the registration; leaving later keeps the seat and the chips', () => {
    let st = registered(3)
    st = act(st, 'u2', { type: 'leave' }, T0)
    expect(st.seats[2]).toBeNull()
    expect(tour(st).entries.u2).toBeUndefined()

    st = running(3)
    const stack = seat(st, 2).stack
    st = act(st, 'u2', { type: 'leave' }, T0 + 6_000)
    expect(seat(st, 2).userId).toBe('u2')
    expect(seat(st, 2).stack).toBe(stack)
    expect(seat(st, 2).sittingOut).toBe(true)
  })

  it('a player sitting out is still dealt in and blinded; every decision of theirs times out at once', () => {
    let st = running(3)
    st = act(st, 'u1', { type: 'sit_out' }, T0 + 6_000)
    st = foldOut(st, T0 + 6_000)
    st = act(st, 'u0', { type: 'tick' }, T0 + 20_000)
    expect(st.phase).toBe('hand')
    expect(seat(st, 1).inHand).toBe(true)
    // play until u1 must act
    for (let k = 0; k < 6 && st.hand?.toAct !== 1; k++) st = act(st, seat(st, st.hand?.toAct as number).userId, { type: 'call' }, T0 + 21_000)
    expect(st.hand?.toAct).toBe(1)
    // no 30-second wait for a player who is away
    expect(st.hand?.deadline).toBeLessThanOrEqual(T0 + 21_000)
    const next = act(st, 'u0', { type: 'tick' }, T0 + 21_000)
    expect(seat(next, 1).last === 'fold' || seat(next, 1).last === 'check').toBe(true)
  })
})

describe('tournament: knock-outs and the winner', () => {
  it('out of chips while rebuys are open: 60 seconds to decide, then out with a place', () => {
    let st = foldOut(running(3), T0 + 6_000)
    seat(st, 0).stack += seat(st, 2).stack
    seat(st, 2).stack = 0
    st = act(st, 'u0', { type: 'tick' }, T0 + 20_000)
    expect(st.phase).toBe('hand')
    expect(seat(st, 2).inHand).toBe(false)
    expect(tour(st).busted.u2?.at).toBe(T0 + 20_000)
    st = foldOut(st, T0 + 21_000)
    st = act(st, 'u0', { type: 'tick' }, T0 + 20_000 + 60_000)
    expect(st.seats[2]).toBeNull()
    expect(tour(st).out).toEqual([{ userId: 'u2', name: 'P2', avatar: null, place: 3, entries: 1 }])
    expect(code(() => applyAction(st, 'u2', { type: 'sit' }, ctx(T0 + 2 * MIN, { profile: { name: 'P2', avatar: null } })))).toBe(
      'ELIMINATED',
    )
  })

  it('"done" knocks the player out at once', () => {
    let st = foldOut(running(3), T0 + 6_000)
    seat(st, 0).stack += seat(st, 1).stack
    seat(st, 1).stack = 0
    expect(code(() => act(st, 'u0', { type: 'bust' }, T0 + 7_000))).toBe('ILLEGAL_ACTION')
    st = act(st, 'u1', { type: 'bust' }, T0 + 7_000)
    expect(st.seats[1]).toBeNull()
    expect(tour(st).out[0]?.place).toBe(3)
  })

  it('two players out in the same hand: the bigger starting stack gets the better place', () => {
    let st = foldOut(running(3), T0 + 6_000)
    // pretend the last hand cost u1 100 and u2 200 and left both with nothing (after the rebuy levels)
    seat(st, 0).stack = 750
    seat(st, 1).stack = 0
    seat(st, 2).stack = 0
    const r = st.hand?.result
    if (r) r.net = { '0': 300, '1': -100, '2': -200 }
    st = act(st, 'u0', { type: 'tick' }, T0 + 31 * MIN)
    const t = tour(st)
    expect(t.out.map((o) => [o.userId, o.place])).toEqual([
      ['u1', 3],
      ['u2', 2],
    ])
    expect(t.winner?.userId).toBe('u0')
    expect(t.status).toBe('finished')
    expect(st.closed).toBe(true)
    const pub = publicView(st, 9)
    expect(pub.tournament?.winner?.place).toBe(1)
    expect(pub.closed).toBe(true)
  })

  it('the opener can cancel a running tournament', () => {
    const st = act(running(3), 'u0', { type: 'close' }, T0 + 6_000)
    expect(st.closed).toBe(true)
    expect(tour(st).status).toBe('cancelled')
    expect(tour(st).winner).toBeNull()
  })

  it('a cash table has no tournament and does not accept start or bust', () => {
    const st = createState('u0')
    expect(st.tournament).toBeNull()
    expect(publicView(st, 1).tournament).toBeNull()
    expect(code(() => applyAction(st, 'u0', { type: 'start' }, ctx(T0)))).toBe('ILLEGAL_ACTION')
  })
})

describe('random tournaments always end with one winner and every chip accounted for', () => {
  it('plays many full tournaments', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const players = 2 + (seed % 7)
      const { st } = playTournament(seed, players)
      const t = tour(st)
      expect(st.closed).toBe(true)
      expect(t.status).toBe('finished')
      expect(t.winner).not.toBeNull()
      expect(t.out.length).toBe(players - 1)
      const places = [...t.out.map((o) => o.place), 1].sort((a, b) => a - b)
      expect(places).toEqual(Array.from({ length: players }, (_, i) => i + 1))
      const entries = Object.values(t.entries).reduce((a, b) => a + b, 0)
      const winnerSeat = st.seats.find((s) => s !== null)
      expect(winnerSeat?.stack).toBe(entries * 250)
    }
  })
})
