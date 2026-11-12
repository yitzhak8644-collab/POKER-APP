import { Link } from 'react-router-dom'
import { Avatar, Money } from '../components/ui'
import { useOverallBalance } from '../features/games/hooks'
import type { BalanceRow } from '../features/games/types'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'

const tone = (n: number): string => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-slate-400')

function Row({ r, rank }: { r: BalanceRow; rank?: number }) {
  const grey = !r.registered
  return (
    <li className={`flex items-center gap-3 p-3 ${grey ? 'opacity-60' : ''}`}>
      {rank !== undefined && <span className="w-5 text-center text-sm text-slate-500">{rank}</span>}
      <Avatar name={r.display_name} src={r.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <bdi>{r.display_name}</bdi>
        </p>
        <p className="text-xs text-slate-500">
          {r.games > 0 ? `${r.games} משחקים באפליקציה` : r.opening !== 0 ? 'עוד לא שיחק באפליקציה' : 'עוד לא שיחק'}
          {r.last_played !== null && <> · אחרון {formatGameDate(r.last_played)}</>}
        </p>
        <p className="text-xs text-slate-500">
          לפני האפליקציה <Money value={r.opening} signed /> · באפליקציה <Money value={r.app_total} signed />
        </p>
      </div>
      <Money value={r.total} signed className={`text-lg font-bold ${tone(r.total)}`} />
    </li>
  )
}

/** Long-term table: each person's total net result = old PayBox balance + every closed game in the app. */
export function BalancePage() {
  const q = useOverallBalance()
  const rows = q.data ?? []
  const registered = rows.filter((r) => r.registered)
  const others = rows.filter((r) => !r.registered && !r.inactive)
  const inactive = rows.filter((r) => !r.registered && r.inactive)
  const inactiveTotal = inactive.reduce((s, r) => s + r.total, 0)
  const sum = rows.reduce((s, r) => s + r.total, 0)

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-400 underline">
          חזרה
        </Link>
        <h1 className="flex-1 text-xl font-bold">טבלת איזון כוללת</h1>
      </header>

      <p className="text-sm text-slate-400">
        סך הרווח/הפסד של כל שחקן: היתרה מקבוצת הפייבוקס הישנה (עד 08/11/2026) ועוד כל המשחקים שנסגרו באפליקציה, נטו אחרי דמי כניסה
        ואירוח. הטבלה מתעדכנת בסיום כל משחק וכשנרשם שחקן חדש.
      </p>

      {q.isLoading && <p className="text-slate-400">טוען…</p>}
      {q.error && <p className="text-rose-400">{toHebrewMessage(q.error)}</p>}

      {registered.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">
          {registered.map((r, i) => (
            <Row key={r.player_key} r={r} rank={i + 1} />
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-400">לא רשומים באפליקציה</h2>
          <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
            {others.map((r) => (
              <Row key={r.player_key} r={r} />
            ))}
          </ul>
        </section>
      )}

      {inactive.length > 0 && (
        <ul className="rounded-2xl border border-slate-800 bg-slate-900/60">
          <li className="flex items-center gap-3 p-3 opacity-60">
            <div className="min-w-0 flex-1">
              <p className="font-medium">שחקנים לא פעילים</p>
              <p className="text-xs text-slate-500">
                {inactive.map((r, i) => (
                  <span key={r.player_key}>
                    {i > 0 && ', '}
                    <bdi>{r.display_name}</bdi>
                  </span>
                ))}
              </p>
            </div>
            <Money value={inactiveTotal} signed className={`text-lg font-bold ${tone(inactiveTotal)}`} />
          </li>
        </ul>
      )}

      {rows.length > 0 && (
        <p className="text-xs text-slate-500">
          סך הכל בטבלה: <Money value={sum} signed />. ההפרש מאפס הוא הכסף שנשאר בקופה הקבוצתית (הוצאות הקבוצה, כמו שולחן וקלפים, לא
          נכללות).
        </p>
      )}
    </main>
  )
}
