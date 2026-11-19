import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { inputCls, Money } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { useIsAdmin, useOverallBalance } from '../features/games/hooks'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'
import { getSupabase } from '../lib/supabase'

interface Stats {
  nights: {
    count: number
    plus: number
    minus: number
    total: number
    best: number | null
    worst: number | null
    average: number | null
    last: string | null
  }
  holdem: {
    hands: number
    won: number
    net: number
    biggestPot: number | null
    sevenDeuce: number
    last: string | null
  }
}

async function fetchStats(user: string | null): Promise<Stats> {
  const { data, error } = await getSupabase().rpc('my_stats', user ? { p_user: user } : {})
  if (error) throw error
  return data as Stats
}

const num = (v: unknown): number => Number(v ?? 0)

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-950 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{children}</dd>
    </div>
  )
}

/** Personal statistics: home-game nights (money) and online Hold'em hands (chips). */
export function StatsPage() {
  const { session } = useAuth()
  const isAdmin = useIsAdmin().data === true
  const players = useOverallBalance()
  const [who, setWho] = useState<string | null>(null)
  const me = session?.user.id ?? ''
  const target = isAdmin && who && who !== me ? who : null
  const q = useQuery({ queryKey: ['my-stats', target ?? 'me'], queryFn: () => fetchStats(target) })
  const s = q.data
  const registered = (players.data ?? []).filter((r) => r.registered)

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-400 underline">
          חזרה
        </Link>
        <h1 className="flex-1 text-xl font-bold">{target ? 'סטטיסטיקה' : 'הסטטיסטיקה שלי'}</h1>
      </header>

      {isAdmin && registered.length > 0 && (
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">שחקן (מנהל כללי)</span>
          <select id="stats-player" className={inputCls} value={who ?? me} onChange={(e) => setWho(e.target.value)}>
            {registered.map((r) => (
              <option key={r.player_key} value={r.player_key}>
                {r.player_key === me ? `${r.display_name} (אתה)` : r.display_name}
              </option>
            ))}
          </select>
        </label>
      )}

      {q.isLoading && <p className="text-slate-400">טוען…</p>}
      {q.error && <p className="text-rose-400">{toHebrewMessage(q.error)}</p>}

      {s && (
        <>
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-bold">ערבי פוקר (כסף)</h2>
            {num(s.nights.count) === 0 ? (
              <p className="text-sm text-slate-400">עוד אין ערבים שנסגרו באפליקציה.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2">
                <Tile label="ערבים">{num(s.nights.count)}</Tile>
                <Tile label="סה״כ באפליקציה">
                  <Money value={num(s.nights.total)} signed />
                </Tile>
                <Tile label="ערבים בפלוס / במינוס">
                  <span className="text-emerald-400">{num(s.nights.plus)}</span> / <span className="text-rose-400">{num(s.nights.minus)}</span>
                </Tile>
                <Tile label="ממוצע לערב">
                  <Money value={num(s.nights.average)} signed />
                </Tile>
                <Tile label="הערב הכי טוב">
                  <Money value={num(s.nights.best)} signed />
                </Tile>
                <Tile label="הערב הכי קשה">
                  <Money value={num(s.nights.worst)} signed />
                </Tile>
              </dl>
            )}
            {s.nights.last && <p className="text-xs text-slate-500">ערב אחרון: {formatGameDate(s.nights.last)}</p>}
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-bold">הולדם אונליין (צ׳יפים)</h2>
            {num(s.holdem.hands) === 0 ? (
              <p className="text-sm text-slate-400">עוד לא שיחקת ידיים אונליין.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2">
                <Tile label="ידיים">{num(s.holdem.hands)}</Tile>
                <Tile label="ידיים שזכית">
                  {num(s.holdem.won)}{' '}
                  <span className="text-sm text-slate-400">({Math.round((num(s.holdem.won) / num(s.holdem.hands)) * 100)}%)</span>
                </Tile>
                <Tile label="נטו בצ׳יפים">
                  <span className={num(s.holdem.net) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    <bdi dir="ltr" className="font-num">
                      {num(s.holdem.net) > 0 ? `+${num(s.holdem.net)}` : num(s.holdem.net)}
                    </bdi>
                  </span>
                </Tile>
                <Tile label="הקופה הכי גדולה">
                  <bdi dir="ltr" className="font-num">
                    {num(s.holdem.biggestPot)}
                  </bdi>
                </Tile>
                <Tile label="זכיות עם 7-2">{num(s.holdem.sevenDeuce)}</Tile>
              </dl>
            )}
          </section>
          <p className="text-xs text-slate-500">היתרה מקבוצת הפייבוקס הישנה ומשחקים שנרשמו מחוץ לאפליקציה לא נכללים כאן.</p>
        </>
      )}
    </main>
  )
}
