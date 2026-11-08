import type { GameBundle, GamePlayerRow, GameRow, TransactionRow } from './types'

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'
export type RealtimeTable = 'games' | 'game_players' | 'transactions'

/** Insert, replace (by id) or remove a row. Never mutates the input list. */
export function applyRowChange<T extends { id: string }>(
  list: readonly T[],
  event: ChangeEvent,
  newRow: T | null,
  oldRow: Partial<T> | null,
): T[] {
  if (event === 'DELETE') {
    const id = oldRow?.id
    return id === undefined ? [...list] : list.filter((row) => row.id !== id)
  }
  if (newRow === null) return [...list]
  const exists = list.some((row) => row.id === newRow.id)
  return exists ? list.map((row) => (row.id === newRow.id ? newRow : row)) : [...list, newRow]
}

/**
 * Applies one Realtime payload to the cached game.
 * Note: Postgres Changes cannot filter DELETE events and RLS is not applied to them
 * (the `old` record only carries the primary key), so deletes of unknown ids are ignored.
 */
export function applyBundleChange(
  bundle: GameBundle,
  table: RealtimeTable,
  event: ChangeEvent,
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null,
): GameBundle {
  if (table === 'games') {
    if (event !== 'UPDATE' || newRow === null) return bundle
    return { ...bundle, game: { ...bundle.game, ...(newRow as Partial<GameRow>) } }
  }
  if (table === 'game_players') {
    return {
      ...bundle,
      players: applyRowChange(
        bundle.players,
        event,
        newRow as GamePlayerRow | null,
        oldRow as Partial<GamePlayerRow> | null,
      ),
    }
  }
  return {
    ...bundle,
    transactions: applyRowChange(
      bundle.transactions,
      event,
      newRow as TransactionRow | null,
      oldRow as Partial<TransactionRow> | null,
    ),
  }
}

/** The settlement row appears when the game closes, so that change needs a refetch. */
export const needsRefetch = (table: RealtimeTable, newRow: Record<string, unknown> | null): boolean =>
  table === 'games' && newRow?.status === 'closed'
