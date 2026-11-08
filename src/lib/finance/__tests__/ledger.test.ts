import { describe, expect, it } from 'vitest'
import { buildPlayers } from '../ledger'
import type { LedgerRow, RosterEntry } from '../types'

const roster: RosterEntry[] = [
  { id: 'h', name: 'Host', role: 'host' },
  { id: 'a', name: 'Avi', role: 'guest' },
  { id: 'b', name: 'Ben', role: 'guest' },
]
const row = (
  playerId: string,
  type: LedgerRow['type'],
  amount: number,
  voided = false,
): LedgerRow => ({ playerId, type, amount, voided })

describe('buildPlayers', () => {
  it('sums buy-ins and rebuys into invested', () => {
    const [h, a] = buildPlayers(roster, [
      row('a', 'buy_in', 100),
      row('a', 'rebuy', 50),
      row('a', 'rebuy', 50),
      row('h', 'buy_in', 100),
    ])
    expect(a).toMatchObject({ id: 'a', name: 'Avi', role: 'guest', invested: 200, cashOut: null })
    expect(h).toMatchObject({ id: 'h', invested: 100 })
  })

  it('keeps roster order and gives players with no rows invested 0', () => {
    const players = buildPlayers(roster, [row('b', 'buy_in', 100)])
    expect(players.map((p) => p.id)).toEqual(['h', 'a', 'b'])
    expect(players.map((p) => p.invested)).toEqual([0, 0, 100])
  })

  it('ignores voided buy-ins and rebuys', () => {
    const [, a] = buildPlayers(roster, [
      row('a', 'buy_in', 100),
      row('a', 'rebuy', 50, true),
    ])
    expect(a?.invested).toBe(100)
  })

  it('records the cash-out; 0 is a real value (busted), not "missing"', () => {
    const players = buildPlayers(roster, [row('a', 'cash_out', 0), row('b', 'cash_out', 130)])
    expect(players.map((p) => p.cashOut)).toEqual([null, 0, 130])
  })

  it('a voided cash-out becomes missing again and can be re-entered', () => {
    const [, a] = buildPlayers(roster, [
      row('a', 'cash_out', 80, true),
      row('a', 'cash_out', 90),
    ])
    expect(a?.cashOut).toBe(90)
    const [, a2] = buildPlayers(roster, [row('a', 'cash_out', 80, true)])
    expect(a2?.cashOut).toBeNull()
  })

  it('rejects two active cash-outs for the same player', () => {
    expect(() =>
      buildPlayers(roster, [row('a', 'cash_out', 80), row('a', 'cash_out', 90)]),
    ).toThrow(/more than one active cash-out/)
  })

  it('rejects rows for players not in the roster', () => {
    expect(() => buildPlayers(roster, [row('zzz', 'buy_in', 100)])).toThrow(/unknown player zzz/)
  })

  it('does not validate voided rows (they never count)', () => {
    expect(() => buildPlayers(roster, [row('zzz', 'buy_in', 100, true)])).not.toThrow()
  })

  it('rejects non-integer amounts', () => {
    expect(() => buildPlayers(roster, [row('a', 'buy_in', 10.5)])).toThrow(RangeError)
  })

  it('rejects zero / negative buy-ins and rebuys', () => {
    expect(() => buildPlayers(roster, [row('a', 'buy_in', 0)])).toThrow(/must be positive/)
    expect(() => buildPlayers(roster, [row('a', 'rebuy', -50)])).toThrow(/must be positive/)
  })

  it('rejects a negative cash-out', () => {
    expect(() => buildPlayers(roster, [row('a', 'cash_out', -1)])).toThrow(/must not be negative/)
  })
})
