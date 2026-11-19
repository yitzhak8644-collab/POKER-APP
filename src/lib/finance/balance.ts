import { CLOSE_TOLERANCE } from './config'
import { sum } from './money'
import type { Player, ZeroSumCheck } from './types'

/** Net poker balance = cash-out - (buy-ins + rebuys). `null` while cash-out is missing. */
export function playerNet(p: Player): number | null {
  return p.cashOut === null ? null : p.cashOut - p.invested
}

/**
 * Zero-sum validation: SUM(net balances) must be exactly 0.
 * - `incomplete`: some cash-outs are still missing (a cash-out of 0 is NOT missing).
 * - `near`:       everyone entered a cash-out and the gap is at most CLOSE_TOLERANCE (either way).
 * - `mismatch`:   everyone entered a cash-out and the gap is bigger than that.
 * - `ok`:         total cash-out == total invested.
 */
export function validateZeroSum(players: readonly Player[]): ZeroSumCheck {
  const totalInvested = sum(players.map((p) => p.invested))
  const totalCashOut = sum(players.map((p) => p.cashOut ?? 0))
  const missingCashOuts = players.filter((p) => p.cashOut === null).map((p) => p.id)
  const diff = totalCashOut - totalInvested
  const status =
    missingCashOuts.length > 0
      ? 'incomplete'
      : diff === 0
        ? 'ok'
        : Math.abs(diff) <= CLOSE_TOLERANCE
          ? 'near'
          : 'mismatch'
  return { status, diff, totalInvested, totalCashOut, missingCashOuts }
}
