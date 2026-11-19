import { validateZeroSum } from './balance'
import { PAYBOX_ID } from './config'
import { computeFees } from './fees'
import { assertMoney } from './money'
import { isSettled, playerResult } from './results'
import { settle } from './settle'
import { buildWhatsAppSummary } from './summary'
import type { Fees, Player, PlayerResult, Transfer, ZeroSumCheck } from './types'

export * from './balance'
export * from './config'
export * from './fees'
export * from './ledger'
export * from './money'
export * from './results'
export * from './settle'
export * from './summary'
export type * from './types'

export interface GameResult {
  /** Total money put into the game (buy-ins + rebuys). */
  pot: number
  check: ZeroSumCheck
  fees: Fees
  players: PlayerResult[]
  /** `true` when zero-sum is `ok` or `near` (gap within CLOSE_TOLERANCE) and there are no roster errors. */
  ready: boolean
  /**
   * What the group fund actually ends up with: the entry fees minus the counting gap
   * (1 NIS too much cashed out -> 1 NIS less to the fund). Equals fees.groupFund when the balance is exact.
   */
  fund: number
  /** Empty unless `ready`. */
  transfers: Transfer[]
  /** WhatsApp text; `null` unless `ready`. */
  summary: string | null
}

function assertValidPlayers(players: readonly Player[]): void {
  const ids = new Set<string>()
  for (const p of players) {
    if (p.id === PAYBOX_ID) throw new Error(`"${PAYBOX_ID}" is reserved for the group fund`)
    if (ids.has(p.id)) throw new Error(`Duplicate player id ${p.id}`)
    ids.add(p.id)
    assertMoney(p.invested, `invested of ${p.id}`)
    if (p.cashOut !== null) assertMoney(p.cashOut, `cashOut of ${p.id}`)
  }
}

/** Single entry point for the UI: everything derived from the current players. */
export function computeGame(players: readonly Player[], date: Date): GameResult {
  assertValidPlayers(players)
  const check = validateZeroSum(players)
  const fees = computeFees(players)
  const results = players.map((p) => playerResult(p, fees))
  const pot = check.totalInvested
  const ready = (check.status === 'ok' || check.status === 'near') && fees.errors.length === 0
  const fund = fees.groupFund - (check.status === 'near' ? check.diff : 0)
  if (!ready) {
    return { pot, check, fees, fund: fees.groupFund, players: results, ready, transfers: [], summary: null }
  }

  const settled = results.filter(isSettled)
  const transfers = settle(
    settled.map((r) => ({ id: r.id, amount: r.obligation })),
    fund,
  )
  const summary = buildWhatsAppSummary({
    date,
    pot,
    groupFund: fund,
    gap: check.diff,
    players: settled,
    transfers,
  })
  return { pot, check, fees, fund, players: results, ready, transfers, summary }
}
