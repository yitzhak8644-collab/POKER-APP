import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Chip } from '../../components/Chip'
import { Money, btnPrimary, btnSecondary, inputCls } from '../../components/ui'
import { CHIPS, formatChipNote, stackValue, type ChipCounts, type ChipId } from '../../lib/chips'

interface Props {
  open: boolean
  playerName: string
  onClose: () => void
  /** Called with the counted total and a note listing the chips ("אדום×10, ירוק×8"). */
  onSave: (amount: number, note: string) => void
}

/** Count the player's chips by colour; the total becomes their Cash-out. */
export function ChipCounterDialog({ open, playerName, onClose, onSave }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={`ספירת צ׳יפים · ${playerName}`}>
      <Counter onClose={onClose} onSave={onSave} />
    </Dialog>
  )
}

function Counter({ onClose, onSave }: Pick<Props, 'onClose' | 'onSave'>) {
  const [counts, setCounts] = useState<Record<ChipId, number>>({ red: 0, green: 0, blue: 0, black: 0, yellow: 0 })
  const total = stackValue(counts)
  const set = (id: ChipId, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(999, n)) }))

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {CHIPS.map((chip) => (
          <li key={chip.id} className="flex items-center gap-2">
            <Chip id={chip.id} size={30} />
            <div className="flex-1 leading-tight">
              <div className="font-semibold">{chip.label}</div>
              <div className="text-xs text-slate-400">
                <Money value={chip.value} /> לצ׳יפ
              </div>
            </div>
            <button type="button" aria-label={`פחות ${chip.label}`} className={`${btnSecondary} px-3`} onClick={() => set(chip.id, counts[chip.id] - 1)}>
              −
            </button>
            <input
              aria-label={`כמות צ׳יפים ${chip.label}`}
              inputMode="numeric"
              dir="ltr"
              className={`${inputCls} font-num w-16 text-center`}
              value={counts[chip.id]}
              onChange={(e) => set(chip.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
            <button type="button" aria-label={`עוד ${chip.label}`} className={`${btnSecondary} px-3`} onClick={() => set(chip.id, counts[chip.id] + 1)}>
              +
            </button>
          </li>
        ))}
      </ul>
      <p className="text-center text-lg font-bold">
        סה״כ: <Money value={total} />
      </p>
      <div className="flex gap-2">
        <button type="button" className={`${btnSecondary} flex-1`} onClick={onClose}>
          ביטול
        </button>
        <button type="button" className={`${btnPrimary} flex-1`} onClick={() => onSave(total, formatChipNote(counts as ChipCounts))}>
          שמור Cash-out
        </button>
      </div>
    </div>
  )
}
