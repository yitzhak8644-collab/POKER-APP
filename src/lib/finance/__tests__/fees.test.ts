import { describe, expect, it } from 'vitest'
import { hostPayoutFor, computeFees, obligationOf } from '../fees'
import { goldenNeutral, goldenWithHost, guest, player } from './helpers'

describe('computeFees — with a host', () => {
  it('host + spouse + 3 guests: fund = 5*3 + 10*2 = 35, host payout = 15', () => {
    const f = computeFees(goldenWithHost())
    expect(f).toMatchObject({
      players: 5,
      guests: 3,
      hostSide: 2,
      hasHost: true,
      hostId: 'H',
      groupFund: 35,
      hostPayout: 15,
      errors: [],
    })
  })

  it('host + guests (no spouse): fund = 5*G + 10, payout = 5*G', () => {
    const f = computeFees([player('H', 'host', 0, 0), guest('a', 0, 0), guest('b', 0, 0)])
    expect(f).toMatchObject({ guests: 2, hostSide: 1, groupFund: 20, hostPayout: 10, errors: [] })
  })

  it('host alone: fund = 10, payout = 0', () => {
    const f = computeFees([player('H', 'host', 0, 0)])
    expect(f).toMatchObject({ hasHost: true, groupFund: 10, hostPayout: 0, errors: [] })
  })

  it('host + spouse only: fund = 20, payout = 0', () => {
    const f = computeFees([player('H', 'host', 0, 0), player('S', 'host_spouse', 0, 0)])
    expect(f).toMatchObject({ groupFund: 20, hostPayout: 0, errors: [] })
  })

  it('payout = 5 * guests for any guest count', () => {
    for (let g = 0; g <= 12; g++) {
      const players = [
        player('H', 'host', 0, 0),
        ...Array.from({ length: g }, (_, i) => guest(`g${i}`, 0, 0)),
      ]
      const f = computeFees(players)
      expect(f.hostPayout).toBe(5 * g)
      expect(f.groupFund).toBe(5 * g + 10)
    }
  })

  it('two hosts is an error; the first one is paid', () => {
    const f = computeFees([player('H1', 'host', 0, 0), player('H2', 'host', 0, 0), guest('a', 0, 0)])
    expect(f.errors).toEqual(['MULTIPLE_HOSTS'])
    expect(f.hostId).toBe('H1')
  })

  it('two spouses is an error', () => {
    const f = computeFees([
      player('H', 'host', 0, 0),
      player('S1', 'host_spouse', 0, 0),
      player('S2', 'host_spouse', 0, 0),
    ])
    expect(f.errors).toEqual(['MULTIPLE_SPOUSES'])
  })
})

describe('computeFees — no host (neutral venue)', () => {
  it('everyone pays 10 into the fund, nobody gets a hosting payout', () => {
    const f = computeFees(goldenNeutral())
    expect(f).toMatchObject({
      players: 4,
      guests: 4,
      hostSide: 0,
      hasHost: false,
      hostId: null,
      groupFund: 40,
      hostPayout: 0,
      errors: [],
    })
  })

  it('a single player is valid', () => {
    const f = computeFees([guest('a', 0, 0)])
    expect(f).toMatchObject({ hasHost: false, groupFund: 10, hostPayout: 0, errors: [] })
  })

  it('a spouse without a host is a blocking error (fund is still 10 per player)', () => {
    const f = computeFees([player('S', 'host_spouse', 0, 0), guest('a', 0, 0)])
    expect(f.errors).toEqual(['SPOUSE_WITHOUT_HOST'])
    expect(f.hasHost).toBe(false)
    expect(f.groupFund).toBe(20)
  })

  it('an empty roster reports NO_PLAYERS', () => {
    const f = computeFees([])
    expect(f.errors).toEqual(['NO_PLAYERS'])
    expect(f.groupFund).toBe(0)
  })
})

describe('hostPayoutFor / obligationOf', () => {
  const fees = computeFees(goldenWithHost())

  it('only the host receives the payout', () => {
    expect(hostPayoutFor({ id: 'H' }, fees)).toBe(15)
    expect(hostPayoutFor({ id: 'S' }, fees)).toBe(0)
    expect(hostPayoutFor({ id: 'A' }, fees)).toBe(0)
  })

  it('obligation = net - 10 (+ payout for the host)', () => {
    expect(obligationOf(40, { id: 'H' }, fees)).toBe(45)
    expect(obligationOf(-20, { id: 'S' }, fees)).toBe(-30)
    expect(obligationOf(-50, { id: 'A' }, fees)).toBe(-60)
    expect(obligationOf(10, { id: 'B' }, fees)).toBe(0)
  })

  it('nobody gets a payout in a neutral venue', () => {
    const neutral = computeFees(goldenNeutral())
    expect(hostPayoutFor({ id: 'A' }, neutral)).toBe(0)
    expect(obligationOf(30, { id: 'A' }, neutral)).toBe(20)
  })
})
