import { describe, expect, it } from 'vitest'
import { applyBundleChange, applyRowChange, needsRefetch } from './realtime'
import type { GameBundle, GamePlayerRow, GameRow, TransactionRow } from './types'

const game: GameRow = {
  id: 'g', owner_id: 'u1', played_on: '2026-11-05', status: 'open', join_code: 'ABCD1234',
  closed_at: null, created_at: 't0', updated_at: 't0',
}
const player = (id: string, name = id): GamePlayerRow => ({
  id, game_id: 'g', user_id: null, display_name: name, avatar_url: null, role: 'guest', created_by: 'u1', created_at: 't0',
})
const tx = (id: string, extra: Partial<TransactionRow> = {}): TransactionRow => ({
  id, game_id: 'g', player_id: 'p1', type: 'buy_in', amount: 100, created_by: 'u1', created_at: 't1',
  player_name: 'p1', player_avatar: null, voided_at: null, voided_by: null, note: null, ...extra,
})
const bundle = (): GameBundle => ({ game, players: [player('p1')], transactions: [tx('t1')], settlement: null })

describe('applyRowChange', () => {
  it('INSERT appends, and replaces when the id already exists (no duplicates)', () => {
    expect(applyRowChange([{ id: 'a' }], 'INSERT', { id: 'b' }, null)).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(applyRowChange([{ id: 'a', v: 1 }], 'INSERT', { id: 'a', v: 2 }, null)).toEqual([{ id: 'a', v: 2 }])
  })

  it('UPDATE replaces by id, or adds a row we have not seen yet', () => {
    expect(applyRowChange([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], 'UPDATE', { id: 'b', v: 2 }, { id: 'b' })).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ])
    expect(applyRowChange([{ id: 'a' }], 'UPDATE', { id: 'c' }, null)).toEqual([{ id: 'a' }, { id: 'c' }])
  })

  it('DELETE removes by the old record id; unknown or missing ids change nothing', () => {
    expect(applyRowChange([{ id: 'a' }, { id: 'b' }], 'DELETE', null, { id: 'a' })).toEqual([{ id: 'b' }])
    expect(applyRowChange([{ id: 'a' }], 'DELETE', null, { id: 'zzz' })).toEqual([{ id: 'a' }])
    expect(applyRowChange([{ id: 'a' }], 'DELETE', null, null)).toEqual([{ id: 'a' }])
    expect(applyRowChange([{ id: 'a' }], 'DELETE', null, {})).toEqual([{ id: 'a' }])
  })

  it('ignores an INSERT/UPDATE without a new record and never mutates its input', () => {
    const list = [{ id: 'a' }]
    expect(applyRowChange(list, 'UPDATE', null, null)).toEqual([{ id: 'a' }])
    applyRowChange(list, 'INSERT', { id: 'b' }, null)
    expect(list).toEqual([{ id: 'a' }])
  })
})

describe('applyBundleChange', () => {
  it('transactions: a new buy-in appears, a void updates in place', () => {
    let b = applyBundleChange(bundle(), 'transactions', 'INSERT', tx('t2', { type: 'rebuy', amount: 50 }) as never, null)
    expect(b.transactions.map((t) => t.id)).toEqual(['t1', 't2'])
    b = applyBundleChange(b, 'transactions', 'UPDATE', tx('t2', { type: 'rebuy', amount: 50, voided_at: 'now', voided_by: 'u1' }) as never, null)
    expect(b.transactions).toHaveLength(2)
    expect(b.transactions[1]?.voided_at).toBe('now')
  })

  it('game_players: insert, update and delete', () => {
    let b = applyBundleChange(bundle(), 'game_players', 'INSERT', player('p2') as never, null)
    expect(b.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    b = applyBundleChange(b, 'game_players', 'UPDATE', { ...player('p2'), role: 'host' } as never, null)
    expect(b.players[1]?.role).toBe('host')
    b = applyBundleChange(b, 'game_players', 'DELETE', null, { id: 'p2' })
    expect(b.players.map((p) => p.id)).toEqual(['p1'])
  })

  it('a DELETE for a player of another game (unfiltered stream) is ignored', () => {
    const before = bundle()
    const after = applyBundleChange(before, 'game_players', 'DELETE', null, { id: 'other-game-player' })
    expect(after.players).toEqual(before.players)
  })

  it('games: UPDATE merges into the cached game; other events are ignored', () => {
    const closed = applyBundleChange(bundle(), 'games', 'UPDATE', { status: 'closed', closed_at: 'now' }, null)
    expect(closed.game).toMatchObject({ id: 'g', status: 'closed', closed_at: 'now', join_code: 'ABCD1234' })
    const b = bundle()
    expect(applyBundleChange(b, 'games', 'INSERT', { status: 'closed' }, null)).toBe(b)
    expect(applyBundleChange(b, 'games', 'UPDATE', null, null)).toBe(b)
  })
})

describe('needsRefetch', () => {
  it('only when the game becomes closed (the settlement row has to be fetched)', () => {
    expect(needsRefetch('games', { status: 'closed' })).toBe(true)
    expect(needsRefetch('games', { status: 'open' })).toBe(false)
    expect(needsRefetch('games', null)).toBe(false)
    expect(needsRefetch('transactions', { status: 'closed' })).toBe(false)
  })
})
