export type Role = 'guest' | 'host' | 'host_spouse'

export type TxType = 'buy_in' | 'rebuy' | 'cash_out'

/** A seated player with already-aggregated amounts (whole NIS). */
export interface Player {
  id: string
  name: string
  role: Role
  /** Sum of all active buy-ins + rebuys. */
  invested: number
  /** Final cash-out. `null` = not entered yet. `0` = busted (valid). */
  cashOut: number | null
}

export type ZeroSumStatus = 'incomplete' | 'ok' | 'mismatch'

export interface ZeroSumCheck {
  status: ZeroSumStatus
  /** totalCashOut - totalInvested. Positive: more cashed out than was put in. */
  diff: number
  totalInvested: number
  totalCashOut: number
  /** Players with no cash-out entered yet. */
  missingCashOuts: string[]
}

export type FeeError =
  | 'NO_PLAYERS'
  | 'MULTIPLE_HOSTS'
  | 'MULTIPLE_SPOUSES'
  | 'SPOUSE_WITHOUT_HOST'

export interface Fees {
  players: number
  guests: number
  /** Host + host's spouse seated at the table. */
  hostSide: number
  /** `false` = neutral venue: everyone pays 10 and all of it goes to the group fund. */
  hasHost: boolean
  hostId: string | null
  groupFund: number
  hostPayout: number
  errors: FeeError[]
}

export interface PlayerResult {
  id: string
  name: string
  role: Role
  invested: number
  cashOut: number | null
  /** cashOut - invested; `null` while cash-out is missing. */
  net: number | null
  entryFee: number
  hostPayout: number
  /** net - entryFee + hostPayout; `null` while cash-out is missing. */
  obligation: number | null
}

export type SettledPlayer = PlayerResult & {
  cashOut: number
  net: number
  obligation: number
}

/** A node in the settlement: positive amount = is owed, negative = owes. */
export interface Balance {
  id: string
  amount: number
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

export interface LedgerRow {
  playerId: string
  type: TxType
  amount: number
  voided: boolean
}

export interface RosterEntry {
  id: string
  name: string
  role: Role
}
