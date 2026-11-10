import { describe, expect, it } from 'vitest'
import { PAYBOX_ID } from '../config'
import { computeGame } from '../index'
import type { Player, Transfer } from '../types'
import { goldenNeutral, goldenWithHost, guest, mulberry32, player } from './helpers'

const R = '‏'
const L = '‎'
const DATE = new Date('2026-11-05T19:30:00Z')

describe('computeGame — golden example #1 (host + spouse + 3 guests)', () => {
  const game = computeGame(goldenWithHost(), DATE)

  it('is ready with the expected pot, fund and host payout', () => {
    expect(game.ready).toBe(true)
    expect(game.pot).toBe(500)
    expect(game.check.status).toBe('ok')
    expect(game.fees).toMatchObject({ groupFund: 25, hostPayout: 15, errors: [] })
  })

  it('per-player net and total obligation', () => {
    const byId = Object.fromEntries(game.players.map((p) => [p.id, p]))
    expect(Object.fromEntries(Object.entries(byId).map(([id, p]) => [id, p.net]))).toEqual({
      H: 40, S: -20, A: -50, B: 10, C: 20,
    })
    expect(Object.fromEntries(Object.entries(byId).map(([id, p]) => [id, p.obligation]))).toEqual({
      H: 50, S: -25, A: -60, B: 0, C: 10,
    })
    expect(byId.H?.hostPayout).toBe(15)
    expect(byId.S?.hostPayout).toBe(0)
  })

  it('SUM(obligation) == -groupFund', () => {
    const total = game.players.reduce((s, p) => s + (p.obligation as number), 0)
    expect(total).toBe(-25)
  })

  it('settles in 3 transfers', () => {
    expect(game.transfers).toEqual([
      { from: 'S', to: PAYBOX_ID, amount: 25 },
      { from: 'A', to: 'H', amount: 50 },
      { from: 'A', to: 'C', amount: 10 },
    ])
  })

  it('builds the full Hebrew WhatsApp summary', () => {
    expect(game.summary).toBe(
      [
        `${R}🃏 *סיכום ערב פוקר*`,
        `${R}📅 05/11/2026 | 💰 קופת המשחק: ${L}500\u00A0₪${L}`,
        '',
        `${R}🔴 *שחקנים במינוס*`,
        `${R}• A${R}: פוקר ${L}-50\u00A0₪${L}, כניסה ${L}-10\u00A0₪${L} = *${L}-60\u00A0₪${L}*`,
        `${R}• S${R}: פוקר ${L}-20\u00A0₪${L}, כניסה ${L}-5\u00A0₪${L} = *${L}-25\u00A0₪${L}*`,
        '',
        `${R}🟢 *שחקנים בפלוס*`,
        `${R}• H${R}: פוקר ${L}+40\u00A0₪${L}, כניסה ${L}-5\u00A0₪${L}, אירוח ${L}+15\u00A0₪${L} = *${L}+50\u00A0₪${L}*`,
        `${R}• C${R}: פוקר ${L}+20\u00A0₪${L}, כניסה ${L}-10\u00A0₪${L} = *${L}+10\u00A0₪${L}*`,
        '',
        `${R}⚪ *שחקנים מאוזנים*`,
        `${R}• B${R}: פוקר ${L}+10\u00A0₪${L}, כניסה ${L}-10\u00A0₪${L} = *${L}0\u00A0₪${L}*`,
        '',
        `${R}🏦 *קופה קבוצתית שנאספה*: ${L}25\u00A0₪${L}`,
        '',
        `${R}💸 *העברות*`,
        `${R}• S${R} משלם ל-קופת PayBox${R} ${L}25\u00A0₪${L}`,
        `${R}• A${R} משלם ל-H${R} ${L}50\u00A0₪${L}`,
        `${R}• A${R} משלם ל-C${R} ${L}10\u00A0₪${L}`,
      ].join('\n'),
    )
  })
})

describe('computeGame — golden example #2 (neutral venue, no host)', () => {
  const game = computeGame(goldenNeutral(), DATE)

  it('every player pays 10 and the whole amount goes to the fund', () => {
    expect(game.ready).toBe(true)
    expect(game.fees).toMatchObject({ hasHost: false, groupFund: 40, hostPayout: 0, errors: [] })
    expect(game.players.map((p) => [p.id, p.obligation])).toEqual([
      ['A', 20], ['B', -20], ['C', -30], ['D', -10],
    ])
    expect(game.players.every((p) => p.hostPayout === 0)).toBe(true)
  })

  it('settles in 3 transfers', () => {
    expect(game.transfers).toEqual([
      { from: 'B', to: 'A', amount: 20 },
      { from: 'C', to: PAYBOX_ID, amount: 30 },
      { from: 'D', to: PAYBOX_ID, amount: 10 },
    ])
  })

  it('the summary has no hosting line and shows the 40 NIS fund', () => {
    expect(game.summary).not.toContain('אירוח')
    expect(game.summary).toContain(`${R}🏦 *קופה קבוצתית שנאספה*: ${L}40\u00A0₪${L}`)
    expect(game.summary).toContain(`קופת המשחק: ${L}400\u00A0₪${L}`)
  })
})

describe('computeGame — edge cases', () => {
  it('a host who loses still receives the hosting payout', () => {
    // H -30, A/B/C +10 each. fund = 5*3 + 10 = 25, payout 15 -> H owes 30 + 10 - 15 = 25.
    const game = computeGame(
      [
        player('H', 'host', 100, 70),
        guest('A', 100, 110),
        guest('B', 100, 110),
        guest('C', 100, 110),
      ],
      DATE,
    )
    expect(game.ready).toBe(true)
    expect(game.players.find((p) => p.id === 'H')?.obligation).toBe(-20)
    expect(game.transfers).toEqual([{ from: 'H', to: PAYBOX_ID, amount: 20 }])
    expect(game.summary).toContain(`אירוח ${L}+15\u00A0₪${L} = *${L}-20\u00A0₪${L}*`)
  })

  it('a busted player (cash-out 0) is valid, not missing', () => {
    const game = computeGame([guest('a', 100, 0), guest('b', 100, 200)], DATE)
    expect(game.ready).toBe(true)
    expect(game.players.find((p) => p.id === 'a')?.net).toBe(-100)
  })

  it('a single seated player pays the 10 NIS fee to the fund', () => {
    const game = computeGame([guest('a', 100, 100)], DATE)
    expect(game.ready).toBe(true)
    expect(game.transfers).toEqual([{ from: 'a', to: PAYBOX_ID, amount: 10 }])
  })

  it('is deterministic regardless of player order', () => {
    const forward = computeGame(goldenWithHost(), DATE)
    const backward = computeGame([...goldenWithHost()].reverse(), DATE)
    expect(backward.transfers).toEqual(forward.transfers)
    expect(backward.summary).toBe(forward.summary)
  })
})

describe('computeGame — gating', () => {
  it('incomplete: no transfers, no summary, partial results for those who cashed out', () => {
    const game = computeGame([guest('a', 100, 150), guest('b', 100, null)], DATE)
    expect(game.ready).toBe(false)
    expect(game.check.status).toBe('incomplete')
    expect(game.transfers).toEqual([])
    expect(game.summary).toBeNull()
    const [a, b] = game.players
    expect(a?.obligation).toBe(40)
    expect(b?.net).toBeNull()
    expect(b?.obligation).toBeNull()
  })

  it('mismatch: flagged, but no transfers and no summary', () => {
    const game = computeGame([guest('a', 100, 150), guest('b', 100, 100)], DATE)
    expect(game.ready).toBe(false)
    expect(game.check).toMatchObject({ status: 'mismatch', diff: 50 })
    expect(game.transfers).toEqual([])
    expect(game.summary).toBeNull()
  })

  it('roster errors block settlement even when the money balances', () => {
    const spouseOnly = computeGame(
      [player('S', 'host_spouse', 100, 120), guest('a', 100, 80)],
      DATE,
    )
    expect(spouseOnly.check.status).toBe('ok')
    expect(spouseOnly.fees.errors).toEqual(['SPOUSE_WITHOUT_HOST'])
    expect(spouseOnly.ready).toBe(false)
    expect(spouseOnly.summary).toBeNull()

    const twoHosts = computeGame([player('H1', 'host', 100, 100), player('H2', 'host', 100, 100)], DATE)
    expect(twoHosts.fees.errors).toEqual(['MULTIPLE_HOSTS'])
    expect(twoHosts.ready).toBe(false)
  })

  it('an empty table is not ready', () => {
    const game = computeGame([], DATE)
    expect(game.ready).toBe(false)
    expect(game.fees.errors).toEqual(['NO_PLAYERS'])
    expect(game.pot).toBe(0)
  })
})

describe('computeGame — input validation', () => {
  it('rejects duplicate ids', () => {
    expect(() => computeGame([guest('a', 100, 100), guest('a', 100, 100)], DATE)).toThrow(/Duplicate/)
  })

  it('rejects the reserved group-fund id', () => {
    expect(() => computeGame([guest(PAYBOX_ID, 100, 100)], DATE)).toThrow(/reserved/)
  })

  it('rejects fractional or negative money', () => {
    expect(() => computeGame([guest('a', 100.5, 100)], DATE)).toThrow(RangeError)
    expect(() => computeGame([guest('a', -100, 100)], DATE)).toThrow(RangeError)
    expect(() => computeGame([guest('a', 100, 99.5)], DATE)).toThrow(RangeError)
    expect(() => computeGame([guest('a', 100, -1)], DATE)).toThrow(RangeError)
  })
})

/** Random but valid zero-sum game (seeded). */
function randomGame(rand: () => number): Player[] {
  const n = 1 + Math.floor(rand() * 10)
  const withHost = rand() < 0.6
  const withSpouse = withHost && n >= 2 && rand() < 0.5
  const invested = Array.from({ length: n }, () => 20 * (1 + Math.floor(rand() * 25)))
  const pot = invested.reduce((a, b) => a + b, 0)
  const cuts = Array.from({ length: n - 1 }, () => Math.floor(rand() * (pot + 1))).sort((a, b) => a - b)
  const bounds = [0, ...cuts, pot]
  return invested.map((inv, i) => {
    const role = withHost && i === 0 ? 'host' : withSpouse && i === 1 ? 'host_spouse' : 'guest'
    return player(`p${String(i).padStart(2, '0')}`, role, inv, (bounds[i + 1] as number) - (bounds[i] as number))
  })
}

describe('computeGame — properties (500 seeded random games)', () => {
  const rand = mulberry32(20261108)
  const games = Array.from({ length: 500 }, () => randomGame(rand))

  it('zero-sum holds, the fund formula matches, obligations sum to -fund, transfers settle everything', () => {
    for (const players of games) {
      const game = computeGame(players, DATE)
      expect(game.ready).toBe(true)

      // independent expectations from raw role counts
      const hosts = players.filter((p) => p.role === 'host').length
      const spouses = players.filter((p) => p.role === 'host_spouse').length
      const guests = players.length - hosts - spouses
      const expectedFund = hosts > 0 ? 5 * guests + 5 * (hosts + spouses) : 10 * players.length
      const expectedPayout = hosts > 0 ? 5 * guests : 0
      expect(game.fees.groupFund).toBe(expectedFund)
      expect(game.fees.hostPayout).toBe(expectedPayout)

      const nets = game.players.map((p) => p.net as number)
      const obligations = game.players.map((p) => p.obligation as number)
      expect(nets.reduce((a, b) => a + b, 0)).toBe(0)
      expect(obligations.reduce((a, b) => a + b, 0)).toBe(-expectedFund)
      expect(game.players.reduce((s, p) => s + p.hostPayout, 0)).toBe(expectedPayout)

      // apply transfers: everybody (incl. the fund) must end at exactly 0
      const balance = new Map<string, number>(game.players.map((p) => [p.id, p.obligation as number]))
      balance.set(PAYBOX_ID, expectedFund)
      for (const t of game.transfers) {
        expect(Number.isInteger(t.amount) && t.amount > 0).toBe(true)
        expect(t.from).not.toBe(t.to)
        balance.set(t.from, (balance.get(t.from) as number) + t.amount)
        balance.set(t.to, (balance.get(t.to) as number) - t.amount)
      }
      expect([...balance.values()].every((v) => v === 0)).toBe(true)

      // never more than (non-zero nodes - 1) transfers
      const nonZeroNodes = obligations.filter((o) => o !== 0).length + (expectedFund > 0 ? 1 : 0)
      expect(game.transfers.length).toBeLessThanOrEqual(Math.max(0, nonZeroNodes - 1))
    }
  })

  it('results do not depend on the order players are given', () => {
    for (const players of games.slice(0, 100)) {
      const a: Transfer[] = computeGame(players, DATE).transfers
      const b: Transfer[] = computeGame([...players].reverse(), DATE).transfers
      expect(b).toEqual(a)
    }
  })

  it('covers both venues and busted players', () => {
    expect(games.some((g) => g.some((p) => p.role === 'host'))).toBe(true)
    expect(games.some((g) => g.every((p) => p.role === 'guest'))).toBe(true)
    expect(games.some((g) => g.some((p) => p.cashOut === 0))).toBe(true)
  })
})
