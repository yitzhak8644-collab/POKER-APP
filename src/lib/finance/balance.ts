import { sum } from './money'
import type { Player, ZeroSumCheck } from './types'

/** Net poker balance = cash-out - (buy-ins + rebuys). `null` while cash-out is missing. */
export function playerNet(p: Player): number | null {
  return p.cashOut === null ? null : p.cashOut - p.invested
}

/**
 * Zero-sum validation: SUM(net balances) must be exactly 0.
 * - `incomplete`: some cash-outs are still missing (a cash-out of 0 is NOT missing).
 * - `mismatch`:   everyone entered a cash-out but total in != total out.
 * - `ok`:         total cash-out == total invested.
 */
export function validateZeroSum(players: readonly Player[]): ZeroSumCheck {
  const totalInvested = sum(players.map((p) => p.invested))
  const totalCashOut = sum(players.map((p) => p.cashOut ?? 0))
  const missingCashOuts = players.filter((p) => p.cashOut === null).map((p) => p.id)
  const diff = totalCashOut - totalInvested
  const status =
    missingCashOuts.length > 0 ? 'incomplete' : diff === 0 ? 'ok' : 'mismatch'
  return { status, diff, totalInvested, totalCashOut, missingCashOuts }
}
