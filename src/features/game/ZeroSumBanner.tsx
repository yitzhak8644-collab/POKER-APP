import type { GameResult } from '../../lib/finance'
import { Money } from '../../components/ui'
import { FEE_ERROR_TEXT } from './labels'

/** Always-visible status: roster problems + the zero-sum check (flagged the instant numbers change). */
export function ZeroSumBanner({ result }: { result: GameResult }) {
  const { check, fees } = result
  return (
    <div className="space-y-2">
      {fees.errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-600 bg-amber-950 p-3 text-sm text-amber-200">
          <ul className="list-disc space-y-1 ps-5">
            {fees.errors.map((e) => (
              <li key={e}>{FEE_ERROR_TEXT[e]}</li>
            ))}
          </ul>
        </div>
      )}
      {check.status === 'incomplete' && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          ממתינים ל-{check.missingCashOuts.length} Cash-out · על השולחן עדיין{' '}
          <Money value={check.totalInvested - check.totalCashOut} />
        </div>
      )}
      {check.status === 'mismatch' && (
        <div role="alert" className="rounded-xl border border-rose-500 bg-rose-950 p-3 text-sm font-semibold text-rose-200">
          ⚠ המאזן לא מתאפס: פער של <Money value={Math.abs(check.diff)} /> —{' '}
          {check.diff > 0 ? 'סך ה-Cash-out גבוה מסך הכניסות' : 'סך ה-Cash-out נמוך מסך הכניסות'}
        </div>
      )}
      {check.status === 'ok' && result.players.length > 0 && (
        <div className="rounded-xl border border-emerald-600 bg-emerald-950 p-3 text-sm text-emerald-200">
          ✓ המאזן מתאפס: סך ה-Cash-out שווה לסך הכניסות (<Money value={result.pot} />)
        </div>
      )}
    </div>
  )
}
