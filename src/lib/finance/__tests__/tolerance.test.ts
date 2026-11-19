import { describe, expect, it } from 'vitest'
import { PAYBOX_ID } from '../config'
import { computeGame, validateZeroSum } from '../index'
import { guest, player } from './helpers'

const DATE = new Date('2026-11-19T21:00:00Z')
const sumTo = (rows: { from: string; to: string; amount: number }[], id: string): number =>
  rows.filter((t) => t.to === id).reduce((a, t) => a + t.amount, 0) - rows.filter((t) => t.from === id).reduce((a, t) => a + t.amount, 0)

describe('a counting gap of up to 2 NIS', () => {
  it('is "near" (closable) up to 2 either way, "mismatch" from 3', () => {
    expect(validateZeroSum([guest('a', 100, 151), guest('b', 100, 50)]).status).toBe('near')
    expect(validateZeroSum([guest('a', 100, 148), guest('b', 100, 50)]).status).toBe('near')
    expect(validateZeroSum([guest('a', 100, 153), guest('b', 100, 50)]).status).toBe('mismatch')
    expect(validateZeroSum([guest('a', 100, 147), guest('b', 100, 50)]).status).toBe('mismatch')
  })

  it('1 NIS too much cashed out: ready, players unchanged, the fund gets 1 NIS less, and the summary says so', () => {
    const game = computeGame([player('H', 'host', 100, 60), guest('a', 100, 191), guest('b', 100, 50)], DATE)
    expect(game.check).toMatchObject({ status: 'near', diff: 1 })
    expect(game.ready).toBe(true)
    expect(game.fees.groupFund).toBe(15)
    expect(game.fund).toBe(14)
    const ob = Object.fromEntries(game.players.map((p) => [p.id, p.obligation]))
    expect(ob).toEqual({ H: -35, a: 81, b: -60 })
    // everybody is paid exactly, the fund receives what is left
    expect(sumTo(game.transfers, PAYBOX_ID)).toBe(14)
    expect(sumTo(game.transfers, 'a')).toBe(81)
    expect(game.summary).toContain('פער בספירה')
    expect(game.summary).toContain('יותר ממה שנכנס')
  })

  it('2 NIS missing: the fund gets 2 NIS more', () => {
    const game = computeGame([guest('a', 100, 150), guest('b', 100, 48)], DATE)
    expect(game.check).toMatchObject({ status: 'near', diff: -2 })
    expect(game.fund).toBe(22)
    expect(sumTo(game.transfers, PAYBOX_ID)).toBe(22)
    expect(game.summary).toContain('פחות ממה שנכנס')
  })

  it('an exact balance says nothing about a gap', () => {
    const game = computeGame([guest('a', 100, 150), guest('b', 100, 50)], DATE)
    expect(game.fund).toBe(game.fees.groupFund)
    expect(game.summary).not.toContain('פער')
  })
})
