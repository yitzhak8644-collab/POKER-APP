import { playerNet } from './balance'
import { entryFeeFor, hostPayoutFor, obligationOf } from './fees'
import type { Fees, Player, PlayerResult, SettledPlayer } from './types'

export function playerResult(p: Player, fees: Fees): PlayerResult {
  const net = playerNet(p)
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    invested: p.invested,
    cashOut: p.cashOut,
    net,
    entryFee: entryFeeFor(p, fees),
    hostPayout: hostPayoutFor(p, fees),
    obligation: net === null ? null : obligationOf(net, p, fees),
  }
}

export const isSettled = (r: PlayerResult): r is SettledPlayer =>
  r.net !== null && r.obligation !== null
