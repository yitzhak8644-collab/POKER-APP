import { PAYBOX_ID } from './config'
import { assertInteger, assertMoney, sum } from './money'
import type { Balance, Transfer } from './types'

interface Node {
  id: string
  /** Remaining magnitude (> 0). */
  amount: number
}

/** Largest first; ties broken by id so results are deterministic. Ids are unique. */
const bySizeThenId = (a: Node, b: Node): number =>
  b.amount - a.amount || (a.id < b.id ? -1 : 1)

/**
 * Debt minimization.
 *
 * `balances`: each player's total obligation (negative = owes, positive = is owed).
 * Their sum is -groupFund, so the group fund joins as a virtual creditor node
 * (PAYBOX_ID, +groupFund) and the whole system sums to zero.
 *
 * 1. Exact matches (a debtor owes exactly what a creditor is owed) become one transfer.
 * 2. Greedy: largest debtor pays largest creditor min(owes, owed); repeat.
 *    Every step zeroes at least one node, so transfers <= (non-zero nodes) - 1.
 */
export function settle(balances: readonly Balance[], groupFund: number): Transfer[] {
  for (const b of balances) {
    assertInteger(b.amount, `balance of ${b.id}`)
    if (b.id === PAYBOX_ID) throw new Error(`"${PAYBOX_ID}" is reserved for the group fund`)
  }
  assertMoney(groupFund, 'groupFund')
  if (sum(balances.map((b) => b.amount)) + groupFund !== 0) {
    throw new RangeError('Balances plus group fund must sum to zero')
  }

  const nodes: Balance[] =
    groupFund > 0 ? [...balances, { id: PAYBOX_ID, amount: groupFund }] : [...balances]
  const debtors = nodes
    .filter((n) => n.amount < 0)
    .map((n) => ({ id: n.id, amount: -n.amount }))
    .sort(bySizeThenId)
  let creditors: Node[] = nodes
    .filter((n) => n.amount > 0)
    .map((n) => ({ id: n.id, amount: n.amount }))
    .sort(bySizeThenId)

  const transfers: Transfer[] = []

  // 1. exact matches
  let remainingDebtors: Node[] = []
  for (const d of debtors) {
    const i = creditors.findIndex((c) => c.amount === d.amount)
    if (i === -1) {
      remainingDebtors.push(d)
    } else {
      const c = creditors[i] as Node
      transfers.push({ from: d.id, to: c.id, amount: d.amount })
      creditors = creditors.filter((_, idx) => idx !== i)
    }
  }

  // 2. greedy
  while (remainingDebtors.length > 0 && creditors.length > 0) {
    remainingDebtors.sort(bySizeThenId)
    creditors.sort(bySizeThenId)
    const d = remainingDebtors[0] as Node
    const c = creditors[0] as Node
    const amount = Math.min(d.amount, c.amount)
    transfers.push({ from: d.id, to: c.id, amount })
    d.amount -= amount
    c.amount -= amount
    remainingDebtors = remainingDebtors.filter((n) => n.amount > 0)
    creditors = creditors.filter((n) => n.amount > 0)
  }

  return transfers
}
