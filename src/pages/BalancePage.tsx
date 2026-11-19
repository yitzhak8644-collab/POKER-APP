import { Link } from 'react-router-dom'
import { Avatar, Money } from '../components/ui'
import { useIsAdmin, useOverallBalance } from '../features/games/hooks'
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
          מחוץ לאפליקציה <Money value={r.opening} signed /> · באפליקציה <Money value={r.app_total} signed />
        </p>
      </div>
      <Money value={r.total} signed className={`text-lg font-bold ${tone(r.total)}`} />
    </li>
  )
}

/** Long-term table: each person's total net result = old PayBox balance + every closed game in the app. */
export function BalancePage() {
  const q = useOverallBalance()
  const admin = useIsAdmin()
  const rows = q.data ?? []
  // Only the general manager sees the whole table; the server returns one row to everyone else.
  if (admin.data !== true) return <MyBalance loading={q.isLoading || admin.isLoading} error={q.error} row={rows[0] ?? null} />
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

/** A player's own line: how much they are up or down overall. */
function MyBalance({ loading, error, row }: { loading: boolean; error: unknown; row: BalanceRow | null }) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-400 underline">
          חזרה
        </Link>
        <h1 className="flex-1 text-xl font-bold">המאזן שלי</h1>
      </header>
      {loading && <p className="text-slate-400">טוען…</p>}
      {error ? <p className="text-rose-400">{toHebrewMessage(error)}</p> : null}
      {!loading && row !== null && (
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
          <p className="text-sm text-slate-400">{row.total > 0 ? 'אתה מרוויח בסך הכול' : row.total < 0 ? 'אתה מפסיד בסך הכול' : 'אתה מאוזן'}</p>
          <p className="text-4xl font-bold">
            <Money value={row.total} signed className={tone(row.total)} />
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-950 p-3">
              <dt className="text-xs text-slate-500">מחוץ לאפליקציה</dt>
              <dd className="mt-1 font-bold">
                <Money value={row.opening} signed />
              </dd>
            </div>
            <div className="rounded-xl bg-slate-950 p-3">
              <dt className="text-xs text-slate-500">באפליקציה</dt>
              <dd className="mt-1 font-bold">
                <Money value={row.app_total} signed />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">
            {row.games > 0 ? `${row.games} משחקים באפליקציה` : 'עוד לא שיחקת באפליקציה'}
            {row.last_played !== null && <> · אחרון {formatGameDate(row.last_played)}</>}
          </p>
          <p className="text-xs text-slate-500">התוצאות של שחקנים אחרים פרטיות.</p>
        </section>
      )}
      {!loading && row === null && !error && <p className="text-slate-400">אין עדיין נתונים עבורך.</p>}
    </main>
  )
}
