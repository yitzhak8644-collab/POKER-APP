import { CLOSE_TOLERANCE, type PlayerResult, type ZeroSumCheck } from '../../lib/finance'
import { Money } from '../../components/ui'

const tone = (v: number): string => (v < 0 ? 'text-rose-300' : v > 0 ? 'text-emerald-300' : 'text-slate-300')

/**
 * A player's money once their Cash-out is in: poker result, fund + hosting as one number
 * (guest -10, host's spouse -5, host -5 plus the hosting fees), and what they pay or get in total.
 */
export function MoneyLine({ p }: { p: PlayerResult }) {
  if (p.net === null || p.obligation === null) return null
  const fees = p.hostPayout - p.entryFee
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-xs">
      <div className="rounded-lg bg-slate-950 px-1 py-1.5">
        <div className="text-slate-500">פוקר</div>
        <div className={`font-bold ${tone(p.net)}`}>
          <Money value={p.net} signed />
        </div>
      </div>
      <div className="rounded-lg bg-slate-950 px-1 py-1.5">
        <div className="text-slate-500">קופה ואירוח</div>
        <div className={`font-bold ${tone(fees)}`}>
          <Money value={fees} signed />
        </div>
      </div>
      <div className="rounded-lg bg-slate-950 px-1 py-1.5 ring-1 ring-slate-700">
        <div className="text-slate-500">סה״כ</div>
        <div className={`text-sm font-bold ${tone(p.obligation)}`}>
          <Money value={p.obligation} signed />
        </div>
      </div>
    </div>
  )
}

/** Bottom line of the Cash-out list: how much money is still missing (or extra) against everything that went in. */
export function CashOutRemaining({ check }: { check: ZeroSumCheck }) {
  const left = check.totalInvested - check.totalCashOut
  const missing = check.missingCashOuts.length
  if (missing === 0 && left === 0) {
    return (
      <p className="rounded-xl border border-emerald-700 bg-emerald-950 p-3 text-sm font-semibold text-emerald-200">
        ✓ הכול הוזן: סך ה-Cash-out שווה לסך הכניסות
      </p>
    )
  }
  if (missing === 0 && Math.abs(left) <= CLOSE_TOLERANCE) {
    return (
      <p className="rounded-xl border border-amber-700 bg-amber-950/60 p-3 text-sm font-semibold text-amber-200">
        הכול הוזן, עם פער קטן של <Money value={Math.abs(left)} />. אפשר לסגור, והפער נספג בקופה.
      </p>
    )
  }
  const waiting = missing > 0 ? (missing === 1 ? ' (עוד שחקן אחד)' : ` (עוד ${missing} שחקנים)`) : ''
  return (
    <p
      role={missing === 0 ? 'alert' : undefined}
      className={`rounded-xl border p-3 text-sm font-semibold ${missing === 0 ? 'border-rose-500 bg-rose-950 text-rose-200' : 'border-amber-700 bg-amber-950/60 text-amber-200'}`}
    >
      {left >= 0 ? (
        <>
          חסר ל-Cash-out: <Money value={left} />
        </>
      ) : (
        <>
          עודף ב-Cash-out: <Money value={-left} />
        </>
      )}
      {waiting}
    </p>
  )
}
