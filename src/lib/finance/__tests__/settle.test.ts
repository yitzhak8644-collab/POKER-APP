import { describe, expect, it } from 'vitest'
import { PAYBOX_ID } from '../config'
import { settle } from '../settle'
import type { Balance, Transfer } from '../types'

/** Applies transfers and returns each node's remaining balance (should all be 0). */
function residuals(balances: Balance[], groupFund: number, transfers: Transfer[]) {
  const map = new Map<string, number>(balances.map((b) => [b.id, b.amount]))
  if (groupFund > 0) map.set(PAYBOX_ID, groupFund)
  for (const t of transfers) {
    map.set(t.from, (map.get(t.from) as number) + t.amount)
    map.set(t.to, (map.get(t.to) as number) - t.amount)
  }
  return [...map.values()]
}

describe('settle', () => {
  it('returns no transfers for an empty table', () => {
    expect(settle([], 0)).toEqual([])
  })

  it('one debtor, exact match with the group fund', () => {
    expect(settle([{ id: 'a', amount: -10 }], 10)).toEqual([
      { from: 'a', to: PAYBOX_ID, amount: 10 },
    ])
  })

  it('exact matches become a single transfer each (neutral-venue golden example)', () => {
    // nets A+30 B-10 C-20 D0, fund 40 -> obligations A+20 B-20 C-30 D-10
    const balances: Balance[] = [
      { id: 'A', amount: 20 },
      { id: 'B', amount: -20 },
      { id: 'C', amount: -30 },
      { id: 'D', amount: -10 },
    ]
    expect(settle(balances, 40)).toEqual([
      { from: 'B', to: 'A', amount: 20 },
      { from: 'C', to: PAYBOX_ID, amount: 30 },
      { from: 'D', to: PAYBOX_ID, amount: 10 },
    ])
  })

  it('greedy: largest debtor pays largest creditor (host golden example)', () => {
    // obligations H+45 S-30 A-60 B0 C+10, fund 35
    const balances: Balance[] = [
      { id: 'H', amount: 45 },
      { id: 'S', amount: -30 },
      { id: 'A', amount: -60 },
      { id: 'B', amount: 0 },
      { id: 'C', amount: 10 },
    ]
    const transfers = settle(balances, 35)
    expect(transfers).toEqual([
      { from: 'A', to: 'H', amount: 45 },
      { from: 'S', to: PAYBOX_ID, amount: 30 },
      { from: 'A', to: 'C', amount: 10 },
      { from: 'A', to: PAYBOX_ID, amount: 5 },
    ])
    expect(residuals(balances, 35, transfers).every((r) => r === 0)).toBe(true)
    // 5 non-zero nodes (H, S, A, C, PAYBOX) -> at most 4 transfers
    expect(transfers.length).toBeLessThanOrEqual(4)
  })

  it('breaks ties by id so the result is deterministic', () => {
    const balances: Balance[] = [
      { id: 'a', amount: -20 },
      { id: 'b', amount: -20 },
      { id: 'c', amount: 15 },
      { id: 'd', amount: 15 },
    ]
    const expected: Transfer[] = [
      { from: 'a', to: 'c', amount: 15 },
      { from: 'b', to: 'd', amount: 15 },
      { from: 'a', to: PAYBOX_ID, amount: 5 },
      { from: 'b', to: PAYBOX_ID, amount: 5 },
    ]
    expect(settle(balances, 10)).toEqual(expected)
    expect(settle([...balances].reverse(), 10)).toEqual(expected)
  })

  it('never produces zero, negative or self transfers', () => {
    const balances: Balance[] = [
      { id: 'a', amount: -7 },
      { id: 'b', amount: -13 },
      { id: 'c', amount: 9 },
      { id: 'd', amount: 1 },
    ]
    for (const t of settle(balances, 10)) {
      expect(t.amount).toBeGreaterThan(0)
      expect(t.from).not.toBe(t.to)
    }
  })

  it('does not mutate its input', () => {
    const balances: Balance[] = [
      { id: 'a', amount: -10 },
      { id: 'b', amount: 4 },
    ]
    const copy = structuredClone(balances)
    settle(balances, 6)
    expect(balances).toEqual(copy)
  })

  it('rejects non-integer balances', () => {
    expect(() => settle([{ id: 'a', amount: -10.5 }], 10.5)).toThrow(RangeError)
  })

  it('rejects the reserved group-fund id as a player id', () => {
    expect(() => settle([{ id: PAYBOX_ID, amount: -10 }], 10)).toThrow(/reserved/)
  })

  it('rejects a negative or fractional group fund', () => {
    expect(() => settle([{ id: 'a', amount: 10 }], -10)).toThrow(/must not be negative/)
    expect(() => settle([{ id: 'a', amount: -1 }], 0.5)).toThrow(RangeError)
  })

  it('rejects balances that do not sum to -groupFund', () => {
    expect(() => settle([{ id: 'a', amount: -10 }], 20)).toThrow(/sum to zero/)
  })
})
