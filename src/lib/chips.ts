/** The table's chips. Values are whole NIS. */
export type ChipId = 'red' | 'green' | 'blue' | 'black' | 'yellow'

export interface ChipDef {
  id: ChipId
  value: number
  /** Singular / plural names in Hebrew. */
  label: string
  plural: string
  color: string
}

export const CHIPS: readonly ChipDef[] = [
  { id: 'red', value: 5, label: 'אדום', plural: 'אדומים', color: '#dc2626' },
  { id: 'green', value: 10, label: 'ירוק', plural: 'ירוקים', color: '#16a34a' },
  { id: 'blue', value: 25, label: 'כחול', plural: 'כחולים', color: '#2563eb' },
  { id: 'black', value: 100, label: 'שחור', plural: 'שחורים', color: '#111827' },
  { id: 'yellow', value: 250, label: 'צהוב', plural: 'צהובים', color: '#eab308' },
]

export type ChipCounts = Partial<Record<ChipId, number>>

/** Every rebuy is 250. */
export const REBUY_AMOUNT = 250

/** A rebuy is handed out in red, green and blue only (no black or yellow): 50 + 100 + 100. */
export const REBUY_STACK: Readonly<ChipCounts> = { red: 10, green: 10, blue: 4 }

/** Total value of a stack. Counts must be whole, non-negative numbers. */
export function stackValue(counts: ChipCounts): number {
  let total = 0
  for (const chip of CHIPS) {
    const n = counts[chip.id] ?? 0
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`${chip.id} count must be a whole number, got ${n}`)
    }
    total += n * chip.value
  }
  return total
}

/** The chips to hand out for an amount: one rebuy stack per 250, otherwise `null` (no standard stack). */
export function stackFor(amount: number): ChipCounts | null {
  if (!Number.isInteger(amount) || amount <= 0 || amount % REBUY_AMOUNT !== 0) return null
  const times = amount / REBUY_AMOUNT
  const stack: ChipCounts = {}
  for (const chip of CHIPS) {
    const n = REBUY_STACK[chip.id]
    if (n !== undefined) stack[chip.id] = n * times
  }
  return stack
}

/** "10 אדומים" / "1 אדום". */
export const chipPhrase = (chip: ChipDef, n: number): string => `${n} ${n === 1 ? chip.label : chip.plural}`

/** "אדום×10, ירוק×8" (only chips that were counted), for the audit log. Empty when nothing was counted. */
export function formatChipNote(counts: ChipCounts): string {
  return CHIPS.filter((chip) => (counts[chip.id] ?? 0) > 0)
    .map((chip) => `${chip.label}×${counts[chip.id]}`)
    .join(', ')
}
