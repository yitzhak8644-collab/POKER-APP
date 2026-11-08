import { CHIPS, chipPhrase, type ChipCounts } from '../lib/chips'
import { Chip } from './Chip'

/** "10 אדומים · 10 ירוקים · 4 כחולים" with a chip icon in front of each colour. */
export function ChipStack({ counts }: { counts: ChipCounts }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {CHIPS.filter((chip) => (counts[chip.id] ?? 0) > 0).map((chip) => (
        <li key={chip.id} className="flex items-center gap-1.5 text-sm">
          <Chip id={chip.id} />
          <span className="font-semibold">{chipPhrase(chip, counts[chip.id] ?? 0)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The chips and what each one is worth. */
export function ChipLegend() {
  return (
    <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <h2 className="text-sm font-bold">ערכי הצ׳יפים</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {CHIPS.map((chip) => (
          <li key={chip.id} className="flex items-center gap-1.5 text-sm">
            <Chip id={chip.id} />
            <span>{chip.label}</span>
            <bdi dir="ltr" className="font-num text-slate-300">
              {chip.value}
            </bdi>
          </li>
        ))}
      </ul>
    </section>
  )
}
