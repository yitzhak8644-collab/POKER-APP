import { ChipStack } from '../../components/ChipStack'
import { Dialog } from '../../components/Dialog'
import { btnPrimary, btnSecondary } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { REBUY_AMOUNT, stackFor } from '../../lib/chips'
import { TX_LABEL } from './labels'

export type Pending = { kind: 'buy_in' | 'rebuy'; playerId: string } | null

interface Props {
  pending: Pending
  playerName: string
  onCancel: () => void
  /** Logs the entry. Resolves when it was saved. */
  onSubmit: (kind: 'buy_in' | 'rebuy', playerId: string, amount: number) => Promise<void>
}

/**
 * Buy-in and Rebuy each have exactly one option: 25 NIS = one chip stack (no other amount is approved).
 * The tap on the button already is the intent, so there is just a confirmation with the chips to take.
 */
export function EntryDialogs({ pending, playerName, onCancel, onSubmit }: Props) {
  return (
    <Dialog open={pending !== null} onClose={onCancel} title={pending ? `${TX_LABEL[pending.kind]} · ${playerName}` : ''}>
      {pending !== null && (
        <FixedEntry
          key={`${pending.kind}-${pending.playerId}`}
          kind={pending.kind}
          onCancel={onCancel}
          onSubmit={() => onSubmit(pending.kind, pending.playerId, REBUY_AMOUNT)}
        />
      )}
    </Dialog>
  )
}

function FixedEntry({
  kind,
  onCancel,
  onSubmit,
}: {
  kind: 'buy_in' | 'rebuy'
  onCancel: () => void
  onSubmit: () => Promise<void>
}) {
  const { run, busy, error } = useAction()
  const stack = stackFor(REBUY_AMOUNT)
  return (
    <div className="space-y-4">
      <p className="text-center text-2xl font-bold">
        <bdi dir="ltr" className="font-num">
          {REBUY_AMOUNT}
        </bdi>{' '}
        ₪
      </p>
      {stack !== null && (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-sm text-slate-400">קחו מהקופסה:</p>
          <ChipStack counts={stack} />
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className={`${btnSecondary} flex-1`} onClick={onCancel}>
          ביטול
        </button>
        <button type="button" className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => void run(onSubmit)}>
          {busy ? 'רושם…' : `רשום ${TX_LABEL[kind]}`}
        </button>
      </div>
    </div>
  )
}
