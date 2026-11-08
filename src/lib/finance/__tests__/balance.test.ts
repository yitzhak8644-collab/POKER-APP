import { describe, expect, it } from 'vitest'
import { playerNet, validateZeroSum } from '../balance'
import { goldenNeutral, goldenWithHost, guest } from './helpers'

describe('playerNet', () => {
  it('= cashOut - invested', () => {
    expect(playerNet(guest('a', 100, 150))).toBe(50)
    expect(playerNet(guest('a', 100, 40))).toBe(-60)
    expect(playerNet(guest('a', 100, 100))).toBe(0)
  })

  it('a busted player (cash-out 0) loses everything they put in', () => {
    expect(playerNet(guest('a', 200, 0))).toBe(-200)
  })

  it('is null while the cash-out is missing', () => {
    expect(playerNet(guest('a', 100, null))).toBeNull()
  })
})

describe('validateZeroSum', () => {
  it('ok when total cash-out equals total invested', () => {
    const r = validateZeroSum(goldenWithHost())
    expect(r.status).toBe('ok')
    expect(r.diff).toBe(0)
    expect(r.totalInvested).toBe(500)
    expect(r.totalCashOut).toBe(500)
    expect(r.missingCashOuts).toEqual([])
  })

  it('mismatch (positive diff): more cashed out than put in', () => {
    const r = validateZeroSum([guest('a', 100, 130), guest('b', 100, 90)])
    expect(r).toMatchObject({ status: 'mismatch', diff: 20 })
  })

  it('mismatch (negative diff): money is missing', () => {
    const r = validateZeroSum([guest('a', 100, 120), guest('b', 100, 60)])
    expect(r).toMatchObject({ status: 'mismatch', diff: -20 })
  })

  it('incomplete while any cash-out is missing, listing who', () => {
    const r = validateZeroSum([guest('a', 100, 150), guest('b', 100, null), guest('c', 100, null)])
    expect(r.status).toBe('incomplete')
    expect(r.missingCashOuts).toEqual(['b', 'c'])
    // money still on the table = totalInvested - totalCashOut = -diff
    expect(-r.diff).toBe(150)
  })

  it('a cash-out of 0 is entered, not missing', () => {
    const r = validateZeroSum([guest('a', 100, 200), guest('b', 100, 0)])
    expect(r.status).toBe('ok')
    expect(r.missingCashOuts).toEqual([])
  })

  it('works for the neutral-venue example', () => {
    expect(validateZeroSum(goldenNeutral()).status).toBe('ok')
  })

  it('an empty table is trivially ok (roster errors are reported by computeFees)', () => {
    expect(validateZeroSum([])).toMatchObject({ status: 'ok', diff: 0, totalInvested: 0 })
  })
})
