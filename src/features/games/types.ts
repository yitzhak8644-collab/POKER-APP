import type { Role, TxType } from '../../lib/finance'

export interface GameRow {
  id: string
  owner_id: string
  /** YYYY-MM-DD */
  played_on: string
  status: 'open' | 'closed'
  join_code: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

/** A row of the open-tables lobby (visible to every signed-in user; never carries the join code). */
export interface OpenGameRow {
  game_id: string
  owner_name: string
  /** YYYY-MM-DD */
  played_on: string
  created_at: string
}

export interface GamePlayerRow {
  id: string
  game_id: string
  /** `null` = a player without an account (added by the table manager). */
  user_id: string | null
  display_name: string
  avatar_url: string | null
  role: Role
  /** Chosen seat at the table (1..10) or `null`. */
  seat: number | null
  /** Whether the player already answered "are you the host?". */
  host_asked: boolean
  created_by: string
  created_at: string
}

export interface TransactionRow {
  id: string
  game_id: string
  player_id: string
  type: TxType
  amount: number
  created_by: string
  created_at: string
  /** Name / avatar of the player at the time of the entry. */
  player_name: string
  player_avatar: string | null
  voided_at: string | null
  voided_by: string | null
  note: string | null
}

export interface BalanceRow {
  player_key: string
  display_name: string
  avatar_url: string | null
  games: number
  total: number
  last_played: string | null
}

export interface SettlementRow {
  game_id: string
  closed_by: string
  snapshot: Record<string, unknown>
  whatsapp_text: string
  created_at: string
}

/** Everything the client needs about one game; kept in sync by Realtime. */
export interface GameBundle {
  game: GameRow
  players: GamePlayerRow[]
  transactions: TransactionRow[]
  settlement: SettlementRow | null
}
