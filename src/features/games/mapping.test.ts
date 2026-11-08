import { describe, expect, it } from 'vitest'
import { PAYBOX_ID } from '../../lib/finance'
import { buildLog, buildSnapshot, defaultBuyInAmount, deriveGame, FALLBACK_BUY_IN, OWNER_LABEL, playedOnDate, toEnginePlayers, UNKNOWN_ACTOR_LABEL } from './mapping'
import type { GameBundle, GamePlayerRow, TransactionRow } from './types'

const seat = (id: string, name: string, role: GamePlayerRow['role'] = 'guest', userId: string | null = null): GamePlayerRow => ({
  id, game_id: 'g', user_id: userId, display_name: name, avatar_url: userId ? `https://img/${name}.png` : null,
  role, seat: null, created_by: 'u-owner', created_at: '2026-11-05T18:00:00Z',
})

let n = 0
const tx = (player: string, type: TransactionRow['type'], amount: number, extra: Partial<TransactionRow> = {}): TransactionRow => ({
  id: `t${String(++n).padStart(3, '0')}`, game_id: 'g', player_id: player, type, amount, created_by: 'u-owner',
  created_at: `2026-11-05T19:${String(n).padStart(2, '0')}:00Z`, player_name: player.toUpperCase(), player_avatar: null,
  voided_at: null, voided_by: null, note: null, ...extra,
})

/** Golden example #1 as database rows: H host, S spouse, A, B, C guests (nets +40 -20 -50 +10 +20). */
function golden(): GameBundle {
  const players = [
    seat('H', 'H', 'host', 'u-owner'), seat('S', 'S', 'host_spouse'),
    seat('A', 'A'), seat('B', 'B'), seat('C', 'C'),
  ]
  const transactions = [
    ...['H', 'S', 'A', 'B', 'C'].map((p) => tx(p, 'buy_in', 100)),
    tx('A', 'rebuy', 50),
    tx('H', 'cash_out', 140), tx('S', 'cash_out', 80), tx('A', 'cash_out', 100), tx('B', 'cash_out', 110), tx('C', 'cash_out', 120),
  ]
  return {
    game: { id: 'g', owner_id: 'u-owner', played_on: '2026-11-05', status: 'open', join_code: 'X', closed_at: null, created_at: 't', updated_at: 't' },
    players, transactions, settlement: null,
  }
}

describe('toEnginePlayers / deriveGame', () => {
  it('turns DB rows into engine players (rebuys count, cash-outs set)', () => {
    const players = toEnginePlayers(golden().players, golden().transactions)
    expect(players.find((p) => p.id === 'A')).toMatchObject({ invested: 150, cashOut: 100, role: 'guest' })
    expect(players.find((p) => p.id === 'H')).toMatchObject({ invested: 100, cashOut: 140, role: 'host' })
  })

  it('matches the engine golden example: ready, fund 35, 4 transfers, summary dated like the game', () => {
    const result = deriveGame(golden())
    expect(result.ready).toBe(true)
    expect(result.fees).toMatchObject({ groupFund: 35, hostPayout: 15 })
    expect(result.transfers).toHaveLength(4)
    expect(result.transfers.some((t) => t.to === PAYBOX_ID)).toBe(true)
    expect(result.summary).toContain('05/11/2026')
  })

  it('ignores voided entries (a voided cash-out makes the game incomplete again)', () => {
    const b = golden()
    const cOut = b.transactions.find((t) => t.player_id === 'C' && t.type === 'cash_out') as TransactionRow
    cOut.voided_at = '2026-11-05T22:00:00Z'
    const result = deriveGame(b)
    expect(result.ready).toBe(false)
    expect(result.check).toMatchObject({ status: 'incomplete', missingCashOuts: ['C'] })
  })

  it('a neutral venue (no host) is ready: everyone pays 10 into the fund', () => {
    const b = golden()
    b.players = [seat('A', 'A'), seat('B', 'B'), seat('C', 'C')]
    b.transactions = [
      tx('A', 'buy_in', 100), tx('B', 'buy_in', 100), tx('C', 'buy_in', 100),
      tx('A', 'cash_out', 130), tx('B', 'cash_out', 90), tx('C', 'cash_out', 80),
    ]
    const result = deriveGame(b)
    expect(result.ready).toBe(true)
    expect(result.fees).toMatchObject({ hasHost: false, groupFund: 30, hostPayout: 0 })
    expect(result.summary).not.toContain('אירוח')
  })
})

describe('playedOnDate', () => {
  it('keeps the calendar day in Israel time', () => {
    expect(playedOnDate('2026-11-05').toISOString()).toBe('2026-11-05T12:00:00.000Z')
  })
})

describe('buildLog', () => {
  it('lists newest first with the player snapshot, the actor and the timestamp', () => {
    const b = golden()
    b.players.push(seat('G', 'Gil', 'guest', 'u-gil'))
    b.transactions.push(tx('A', 'rebuy', 50, { created_by: 'u-gil' }))
    const log = buildLog(b)
    expect(log[0]).toMatchObject({ type: 'rebuy', amount: 50, playerName: 'A', actorName: 'Gil', actorAvatar: 'https://img/Gil.png', voided: false })
    expect(log.map((e) => e.at)).toEqual([...log.map((e) => e.at)].sort().reverse())
  })

  it('names the actor: seated user, unseated table manager, or unknown', () => {
    const b = golden()
    b.players = b.players.filter((p) => p.user_id === null) // the owner is not seated
    b.transactions = [
      tx('A', 'buy_in', 100, { created_by: 'u-owner' }),
      tx('B', 'buy_in', 100, { created_by: 'u-stranger' }),
    ]
    const names = Object.fromEntries(buildLog(b).map((e) => [e.playerName, e.actorName]))
    expect(names).toEqual({ A: OWNER_LABEL, B: UNKNOWN_ACTOR_LABEL })
  })

  it('shows who voided an entry', () => {
    const b = golden()
    const first = b.transactions[0] as TransactionRow
    first.voided_at = '2026-11-05T23:00:00Z'
    first.voided_by = 'u-owner'
    const entry = buildLog(b).find((e) => e.id === first.id)
    expect(entry).toMatchObject({ voided: true, voidedAt: '2026-11-05T23:00:00Z', voidedByName: 'H' })
  })

  it('orders entries with identical timestamps deterministically', () => {
    const b = golden()
    b.transactions = [
      tx('A', 'buy_in', 100, { created_at: '2026-11-05T19:00:00Z', id: 'a' }),
      tx('B', 'buy_in', 100, { created_at: '2026-11-05T19:00:00Z', id: 'b' }),
    ]
    expect(buildLog(b).map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('defaultBuyInAmount', () => {
  it('is the most common active buy-in amount', () => {
    const txs = [tx('A', 'buy_in', 50), tx('B', 'buy_in', 100), tx('C', 'buy_in', 100), tx('A', 'rebuy', 500)]
    expect(defaultBuyInAmount(txs)).toBe(100)
  })

  it('ignores voided buy-ins and falls back when there are none', () => {
    expect(defaultBuyInAmount([tx('A', 'buy_in', 70, { voided_at: 'x' })])).toBe(FALLBACK_BUY_IN)
    expect(defaultBuyInAmount([])).toBe(FALLBACK_BUY_IN)
  })
})

describe('buildSnapshot', () => {
  it('keeps the numbers that were settled (and is JSON-serialisable for the RPC)', () => {
    const result = deriveGame(golden())
    const snapshot = JSON.parse(JSON.stringify(buildSnapshot(result)))
    expect(snapshot).toMatchObject({ version: 1, pot: 550, fees: { groupFund: 35, hostPayout: 15 } })
    expect(snapshot.transfers).toHaveLength(4)
    expect(snapshot.players).toHaveLength(5)
  })
})

describe('log notes (chips counted for a cash-out)', () => {
  it('shows the note saved with an entry, and null when there is none', () => {
    const b = golden()
    b.transactions = [
      tx('A', 'cash_out', 140, { note: 'אדום×10, ירוק×8' }),
      tx('B', 'buy_in', 250),
    ]
    const byPlayer = Object.fromEntries(buildLog(b).map((e) => [e.playerName, e.note]))
    expect(byPlayer).toEqual({ A: 'אדום×10, ירוק×8', B: null })
  })

  it('the default buy-in is 250 (a rebuy stack) when nobody has bought in yet', () => {
    expect(FALLBACK_BUY_IN).toBe(250)
    expect(defaultBuyInAmount([])).toBe(250)
  })
})
