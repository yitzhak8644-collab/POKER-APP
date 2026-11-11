import { Link } from 'react-router-dom'
import { Avatar, Money } from '../components/ui'
import { useOverallBalance } from '../features/games/hooks'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'

/** Long-term table: each person's total net result over every closed game. */
export function BalancePage() {
  const q = useOverallBalance()
  const rows = q.data ?? []
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
        סך הרווח/הפסד נטו של כל שחקן מכל המשחקים שנסגרו (אחרי דמי כניסה ואירוח). הטבלה מתעדכנת בסיום כל משחק וכשנרשם שחקן חדש.
      </p>

      {q.isLoading && <p className="text-slate-400">טוען…</p>}
      {q.error && <p className="text-rose-400">{toHebrewMessage(q.error)}</p>}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">
          {rows.map((r, i) => (
            <li key={r.player_key} className="flex items-center gap-3 p-3">
              <span className="w-5 text-center text-sm text-slate-500">{i + 1}</span>
              <Avatar name={r.display_name} src={r.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <bdi>{r.display_name}</bdi>
                </p>
                <p className="text-xs text-slate-500">
                  {r.games === 0 ? 'עוד לא שיחק' : `${r.games} משחקים`}
                  {r.last_played !== null && <> · אחרון {formatGameDate(r.last_played)}</>}
                </p>
              </div>
              <Money
                value={r.total}
                signed
                className={r.total > 0 ? 'text-emerald-400' : r.total < 0 ? 'text-rose-400' : 'text-slate-400'}
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && sum !== 0 && (
        <p className="text-xs text-slate-500">
          הפרש כולל של הטבלה: <Money value={sum} signed />. זה הקופה הקבוצתית שנצברה.
        </p>
      )}
    </main>
  )
}
