import { useState } from 'react'
import { ChipStack } from '../../components/ChipStack'
import { Dialog } from '../../components/Dialog'
import { btnPrimary, btnSecondary, inputCls } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { REBUY_AMOUNT, stackFor } from '../../lib/chips'
import { REBUY_WARNING, TX_LABEL } from './labels'

export type Pending = { kind: 'buy_in' | 'rebuy'; playerId: string; step: 'warn' | 'amount' } | null

interface Props {
  pending: Pending
  playerName: string
  defaultAmount: number
  onCancel: () => void
  onContinue: () => void
  /** Logs the entry. Resolves when it was saved. */
  onSubmit: (kind: 'buy_in' | 'rebuy', playerId: string, amount: number) => Promise<void>
}

const PRESETS = [25, 50, 100]

/**
 * Buy-in: pick an amount and log it.
 * Rebuy: a blocking alert first ("log it in the app FIRST, only then take the chips"),
 * and only after an explicit confirmation tap the amount is chosen and logged.
 */
export function EntryDialogs({ pending, playerName, defaultAmount, onCancel, onContinue, onSubmit }: Props) {
  const showWarning = pending?.kind === 'rebuy' && pending.step === 'warn'
  const showAmount = pending !== null && !showWarning

  return (
    <>
      <Dialog open={showWarning} onClose={onCancel} title={`Rebuy · ${playerName}`} tone="warning">
        <p role="alert" className="rounded-xl bg-amber-950 p-3 text-lg font-bold leading-snug text-amber-200">
          {REBUY_WARNING}
        </p>
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} flex-1`} onClick={onCancel}>
            ביטול
          </button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={onContinue}>
            הבנתי, המשך
          </button>
        </div>
      </Dialog>
      <Dialog open={showAmount} onClose={onCancel} title={pending ? `${TX_LABEL[pending.kind]} · ${playerName}` : ''}>
        {pending && (
          <AmountForm
            key={`${pending.kind}-${pending.playerId}`}
            kind={pending.kind}
            defaultAmount={pending.kind === 'rebuy' ? REBUY_AMOUNT : defaultAmount}
            onCancel={onCancel}
            onSubmit={(amount) => onSubmit(pending.kind, pending.playerId, amount)}
          />
        )}
      </Dialog>
    </>
  )
}

function AmountForm({
  kind,
  defaultAmount,
  onCancel,
  onSubmit,
}: {
  kind: 'buy_in' | 'rebuy'
  defaultAmount: number
  onCancel: () => void
  onSubmit: (amount: number) => Promise<void>
}) {
  const [text, setText] = useState(String(defaultAmount))
  const { run, busy, error } = useAction()
  const amount = Number(text)
  const valid = Number.isInteger(amount) && amount > 0
  const stack = valid ? stackFor(amount) : null

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) void run(() => onSubmit(amount))
      }}
    >
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setText(String(p))}
            className={`${btnSecondary} ${amount === p ? 'border-emerald-500' : ''}`}
          >
            <bdi dir="ltr" className="font-num">
              {p}
            </bdi>
          </button>
        ))}
      </div>
      <label className="block space-y-1 text-sm text-slate-400">
        סכום (₪)
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          dir="ltr"
          className={`${inputCls} font-num text-lg`}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
      </label>
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
        <button type="submit" className={`${btnPrimary} flex-1`} disabled={!valid || busy}>
          {busy ? 'רושם…' : `רשום ${kind === 'rebuy' ? 'Rebuy' : 'Buy-in'}`}
        </button>
      </div>
    </form>
  )
}
