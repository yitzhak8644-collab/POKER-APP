import type { Role, TxType } from '../../lib/finance'
import { getSupabase } from '../../lib/supabase'
import type { BalanceRow, GameBundle, GamePlayerRow, GameRow, OpenGameRow, SettlementRow, TransactionRow } from './types'

/** Throws the original Postgrest error (its `message` is a stable key, see lib/errors.ts). */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw result.error
  return result.data as T
}

export async function fetchMyGames(): Promise<GameRow[]> {
  const result = await getSupabase()
    .from('games')
    .select('*')
    .order('played_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  return unwrap<GameRow[]>(result)
}

/** Ids of games where the signed-in user is an actual player (admins see every game, so this is not "my games"). */
export async function fetchMyPlayerGameIds(): Promise<string[]> {
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const result = await sb.from('game_players').select('game_id').eq('user_id', uid)
  return unwrap<{ game_id: string }[]>(result).map((r) => r.game_id)
}

export async function fetchOverallBalance(): Promise<BalanceRow[]> {
  const result = await getSupabase().rpc('overall_balance')
  // numeric columns can arrive as strings; make them real numbers
  return unwrap<BalanceRow[]>(result).map((r) => ({
    ...r,
    opening: Number(r.opening),
    app_total: Number(r.app_total),
    total: Number(r.total),
  }))
}

export async function fetchOpenGames(): Promise<OpenGameRow[]> {
  const result = await getSupabase()
    .from('open_games')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return unwrap<OpenGameRow[]>(result)
}

export async function fetchGameBundle(gameId: string): Promise<GameBundle> {
  const sb = getSupabase()
  const [game, players, transactions, settlement] = await Promise.all([
    sb.from('games').select('*').eq('id', gameId).maybeSingle(),
    sb.from('game_players').select('*').eq('game_id', gameId).order('created_at'),
    sb.from('transactions').select('*').eq('game_id', gameId).order('created_at'),
    sb.from('settlements').select('*').eq('game_id', gameId).maybeSingle(),
  ])
  const gameRow = unwrap<GameRow | null>(game)
  if (gameRow === null) throw { message: 'GAME_NOT_FOUND' }
  return {
    game: gameRow,
    players: unwrap<GamePlayerRow[]>(players),
    transactions: unwrap<TransactionRow[]>(transactions),
    settlement: unwrap<SettlementRow | null>(settlement),
  }
}

export async function createGame(playedOn: string, joinAsPlayer = true): Promise<string> {
  const result = await getSupabase().rpc('create_game', {
    p_played_on: playedOn,
    p_join_as_player: joinAsPlayer,
  })
  return unwrap<string>(result)
}

export async function joinGame(code: string): Promise<string> {
  return unwrap<string>(await getSupabase().rpc('join_game', { p_code: code }))
}

/** One-tap join from the open-tables lobby (no code needed). */
export async function joinOpenGame(gameId: string): Promise<string> {
  return unwrap<string>(await getSupabase().rpc('join_open_game', { p_game_id: gameId }))
}

/** The signed-in player answers "are you the host?" (at most two hosts per table). */
export async function answerHostQuestion(gameId: string, isHost: boolean): Promise<void> {
  const result = await getSupabase().rpc('answer_host_question', { p_game_id: gameId, p_is_host: isHost })
  unwrap<null>({ data: null, error: result.error })
}

/** Table manager: add a player without an account (e.g. the host's spouse). */
export async function addPlayer(gameId: string, displayName: string, role: Role = 'guest'): Promise<void> {
  const result = await getSupabase()
    .from('game_players')
    .insert({ game_id: gameId, display_name: displayName.trim(), role })
  unwrap<null>({ data: null, error: result.error })
}

export async function renamePlayer(playerId: string, displayName: string): Promise<void> {
  const result = await getSupabase()
    .from('game_players')
    .update({ display_name: displayName.trim() })
    .eq('id', playerId)
  unwrap<null>({ data: null, error: result.error })
}

export async function removePlayer(playerId: string): Promise<void> {
  const result = await getSupabase().from('game_players').delete().eq('id', playerId)
  unwrap<null>({ data: null, error: result.error })
}

/** Atomic: making X the host demotes the current host (same for the spouse). */
export async function setPlayerRole(playerId: string, role: Role): Promise<void> {
  const result = await getSupabase().rpc('set_player_role', { p_player_id: playerId, p_role: role })
  unwrap<null>({ data: null, error: result.error })
}

/** A player seats themselves; the table manager can seat anyone. `null` leaves the seat. */
export async function setPlayerSeat(playerId: string, seat: number | null): Promise<void> {
  const result = await getSupabase().rpc('set_player_seat', { p_player_id: playerId, p_seat: seat })
  unwrap<null>({ data: null, error: result.error })
}

export async function addTransaction(input: {
  gameId: string
  playerId: string
  type: TxType
  amount: number
  note?: string
}): Promise<void> {
  const result = await getSupabase().from('transactions').insert({
    game_id: input.gameId,
    player_id: input.playerId,
    type: input.type,
    amount: input.amount,
    note: input.note ?? null,
  })
  unwrap<null>({ data: null, error: result.error })
}

export async function voidTransaction(id: string): Promise<void> {
  const result = await getSupabase().rpc('void_transaction', { p_id: id })
  unwrap<null>({ data: null, error: result.error })
}

export async function fetchIsAdmin(): Promise<boolean> {
  return unwrap<boolean>(await getSupabase().rpc('is_app_admin'))
}

/** General manager only: permanently deletes a game with all its data. */
export async function adminDeleteGame(gameId: string): Promise<void> {
  const result = await getSupabase().rpc('admin_delete_game', { p_game_id: gameId })
  unwrap<null>({ data: null, error: result.error })
}

export async function closeGame(
  gameId: string,
  snapshot: Record<string, unknown>,
  whatsappText: string,
  force = false,
): Promise<void> {
  const result = await getSupabase().rpc('close_game', {
    p_game_id: gameId,
    p_snapshot: snapshot,
    p_whatsapp_text: whatsappText,
    p_force: force,
  })
  unwrap<null>({ data: null, error: result.error })
}
