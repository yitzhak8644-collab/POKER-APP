import { assertInteger } from './money'
import type { LedgerRow, Player, RosterEntry } from './types'

/**
 * Turns the raw append-only ledger into engine players.
 * - voided rows are ignored (a voided cash-out becomes "missing" again);
 * - buy-ins and rebuys add to `invested` (amount must be > 0);
 * - at most one active cash-out per player; a cash-out of 0 is valid (busted).
 */
export function buildPlayers(
  roster: readonly RosterEntry[],
  rows: readonly LedgerRow[],
): Player[] {
  const invested = new Map<string, number>(roster.map((r) => [r.id, 0]))
  const cashOuts = new Map<string, number>()

  for (const row of rows) {
    if (row.voided) continue
    const current = invested.get(row.playerId)
    if (current === undefined) {
      throw new Error(`Ledger row references unknown player ${row.playerId}`)
    }
    assertInteger(row.amount, `${row.type} amount`)
    if (row.type === 'cash_out') {
      if (row.amount < 0) throw new RangeError(`cash_out amount must not be negative`)
      if (cashOuts.has(row.playerId)) {
        throw new Error(`Player ${row.playerId} has more than one active cash-out`)
      }
      cashOuts.set(row.playerId, row.amount)
    } else {
      if (row.amount <= 0) throw new RangeError(`${row.type} amount must be positive`)
      invested.set(row.playerId, current + row.amount)
    }
  }

  return roster.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    invested: invested.get(r.id) as number,
    cashOut: cashOuts.get(r.id) ?? null,
  }))
}
