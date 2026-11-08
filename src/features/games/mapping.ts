import { buildPlayers, computeGame, type GameResult, type LedgerRow, type Player } from '../../lib/finance'
import type { GameBundle, GamePlayerRow, TransactionRow } from './types'

export const OWNER_LABEL = 'מנהל השולחן'
export const UNKNOWN_ACTOR_LABEL = 'שחקן'
export const FALLBACK_BUY_IN = 250

export function toLedgerRows(transactions: readonly TransactionRow[]): LedgerRow[] {
  return transactions.map((t) => ({
    playerId: t.player_id,
    type: t.type,
    amount: t.amount,
    voided: t.voided_at !== null,
  }))
}

/** DB rows -> the pure engine's input (voided entries are ignored by the ledger). */
export function toEnginePlayers(
  players: readonly GamePlayerRow[],
  transactions: readonly TransactionRow[],
): Player[] {
  return buildPlayers(
    players.map((p) => ({ id: p.id, name: p.display_name, role: p.role })),
    toLedgerRows(transactions),
  )
}

/** `played_on` is a calendar date; noon UTC is the same calendar day in Israel all year. */
export function playedOnDate(playedOn: string): Date {
  return new Date(`${playedOn}T12:00:00Z`)
}

export function deriveGame(bundle: GameBundle): GameResult {
  return computeGame(
    toEnginePlayers(bundle.players, bundle.transactions),
    playedOnDate(bundle.game.played_on),
  )
}

/** What is stored with the closed game (the server re-checks the numbers itself). */
export function buildSnapshot(result: GameResult): Record<string, unknown> {
  return {
    version: 1,
    pot: result.pot,
    fees: result.fees,
    check: result.check,
    players: result.players,
    transfers: result.transfers,
  }
}

/** The most common active buy-in amount at this table (a sensible default for Buy-in / Rebuy). */
export function defaultBuyInAmount(transactions: readonly TransactionRow[]): number {
  const counts = new Map<number, number>()
  for (const t of transactions) {
    if (t.type === 'buy_in' && t.voided_at === null) counts.set(t.amount, (counts.get(t.amount) ?? 0) + 1)
  }
  let best = FALLBACK_BUY_IN
  let bestCount = 0
  for (const [amount, count] of counts) {
    if (count > bestCount) {
      best = amount
      bestCount = count
    }
  }
  return best
}

export interface LogEntry {
  id: string
  at: string
  type: TransactionRow['type']
  amount: number
  playerName: string
  playerAvatar: string | null
  actorName: string
  actorAvatar: string | null
  voided: boolean
  voidedAt: string | null
  voidedByName: string | null
  /** Free text saved with the entry (e.g. the chips counted for a Cash-out). */
  note: string | null
}

/** Audit log, newest first: who logged what, for whom, and when. */
export function buildLog(bundle: GameBundle): LogEntry[] {
  const nameOf = (userId: string | null): { name: string; avatar: string | null } => {
    const seat = bundle.players.find((p) => p.user_id === userId)
    if (seat) return { name: seat.display_name, avatar: seat.avatar_url }
    if (userId === bundle.game.owner_id) return { name: OWNER_LABEL, avatar: null }
    return { name: UNKNOWN_ACTOR_LABEL, avatar: null }
  }
  return bundle.transactions
    .map((t) => {
      const actor = nameOf(t.created_by)
      return {
        id: t.id,
        at: t.created_at,
        type: t.type,
        amount: t.amount,
        playerName: t.player_name,
        playerAvatar: t.player_avatar,
        actorName: actor.name,
        actorAvatar: actor.avatar,
        voided: t.voided_at !== null,
        voidedAt: t.voided_at,
        voidedByName: t.voided_by === null ? null : nameOf(t.voided_by).name,
        note: t.note,
      }
    })
    .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1))
}
