import { CHIPS, type ChipId } from '../lib/chips'

/** A poker chip seen from above, in the colour of the table's chip of that value. */
export function Chip({ id, size = 24 }: { id: ChipId; size?: number }) {
  const color = CHIPS.find((c) => c.id === id)?.color ?? '#6b7280'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="15" fill={color} stroke="#f8fafc" strokeOpacity="0.5" strokeWidth="1" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#f8fafc" strokeWidth="2.2" strokeDasharray="5 4.2" strokeOpacity="0.9" />
      <circle cx="16" cy="16" r="7" fill={color} stroke="#0f172a" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  )
}
