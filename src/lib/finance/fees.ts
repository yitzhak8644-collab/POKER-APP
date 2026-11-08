import {
  ENTRY_FEE,
  GUEST_FUND_SHARE,
  GUEST_HOST_FEE,
  HOST_SIDE_FUND,
} from './config'
import type { FeeError, Fees, Player } from './types'

/**
 * Entry-fee allocation. The host is OPTIONAL.
 *
 * With a host:    guest -> 5 fund + 5 host; host & spouse -> 10 fund.
 *                 groupFund = 5*guests + 10*(host + spouse); hostPayout = 5*guests.
 * Without a host (neutral venue): everyone pays 10, all of it to the fund.
 *                 groupFund = 10*players; hostPayout = 0.
 *
 * Invariant (any roster): SUM(obligation) == -groupFund.
 */
export function computeFees(players: readonly Player[]): Fees {
  const hosts = players.filter((p) => p.role === 'host')
  const spouses = players.filter((p) => p.role === 'host_spouse')
  const guests = players.filter((p) => p.role === 'guest').length
  const hostSide = hosts.length + spouses.length

  const errors: FeeError[] = []
  if (players.length === 0) errors.push('NO_PLAYERS')
  if (hosts.length > 1) errors.push('MULTIPLE_HOSTS')
  if (spouses.length > 1) errors.push('MULTIPLE_SPOUSES')
  if (hosts.length === 0 && spouses.length > 0) errors.push('SPOUSE_WITHOUT_HOST')

  const host = hosts[0]
  if (host === undefined) {
    return {
      players: players.length,
      guests,
      hostSide,
      hasHost: false,
      hostId: null,
      groupFund: ENTRY_FEE * players.length,
      hostPayout: 0,
      errors,
    }
  }
  return {
    players: players.length,
    guests,
    hostSide,
    hasHost: true,
    hostId: host.id,
    groupFund: GUEST_FUND_SHARE * guests + HOST_SIDE_FUND * hostSide,
    hostPayout: GUEST_HOST_FEE * guests,
    errors,
  }
}

/** Hosting payout received by this player (non-zero only for the host). */
export function hostPayoutFor(p: Pick<Player, 'id'>, fees: Fees): number {
  return p.id === fees.hostId ? fees.hostPayout : 0
}

/** Total net obligation = poker net - entry fee + host payout (if host). */
export function obligationOf(net: number, p: Pick<Player, 'id'>, fees: Fees): number {
  return net - ENTRY_FEE + hostPayoutFor(p, fees)
}
