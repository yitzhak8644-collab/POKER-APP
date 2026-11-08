import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PayBoxLink } from '../components/PayBoxLink'
import { Avatar, Badge, btnPrimary, btnSecondary, inputCls } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { createGame, joinGame } from '../features/games/api'
import { MY_GAMES_KEY, useMyGames } from '../features/games/hooks'
import { useAction } from '../hooks/useAction'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate, todayInIsrael } from '../lib/format'

export function HomePage() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const games = useMyGames()
  const create = useAction()
  const join = useAction()
  const [date, setDate] = useState(todayInIsrael())
  const [asPlayer, setAsPlayer] = useState(true)
  const [code, setCode] = useState('')

  const meta = session?.user.user_metadata ?? {}
  const name = (meta.full_name ?? meta.name ?? 'שחקן') as string
  const avatar = (meta.avatar_url ?? meta.picture ?? null) as string | null

  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <header className="flex items-center gap-3">
        <Avatar name={name} src={avatar} />
        <h1 className="flex-1 text-xl font-bold">שלום, {name}</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-slate-400 underline">
          התנתקות
        </button>
      </header>

      <PayBoxLink />

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">משחק חדש</h2>
        <label className="block space-y-1 text-sm text-slate-400">
          תאריך
          <input type="date" dir="ltr" className={`${inputCls} font-num`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asPlayer} onChange={(e) => setAsPlayer(e.target.checked)} />
          אני משחק/ת בעצמי (אחרת אני רק מנהל/ת את השולחן)
        </label>
        <button
          type="button"
          className={`${btnPrimary} w-full`}
          disabled={create.busy || date === ''}
          onClick={async () => {
            const r = await create.run(() => createGame(date, asPlayer))
            if (r.ok) {
              void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
              navigate(`/g/${r.value}`)
            }
          }}
        >
          {create.busy ? 'יוצר…' : 'פתיחת משחק'}
        </button>
        {create.error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {create.error}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">הצטרפות בקוד</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await join.run(() => joinGame(code))
            if (r.ok) navigate(`/g/${r.value}`)
          }}
        >
          <input
            dir="ltr"
            className={`${inputCls} font-num uppercase tracking-widest`}
            placeholder="קוד"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={12}
          />
          <button type="submit" className={btnSecondary} disabled={join.busy || code.trim() === ''}>
            הצטרף
          </button>
        </form>
        {join.error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {join.error}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">המשחקים שלי</h2>
        {games.isLoading && <p className="text-slate-400">טוען…</p>}
        {games.error && <p className="text-rose-400">{toHebrewMessage(games.error)}</p>}
        {games.data?.length === 0 && <p className="text-slate-400">עדיין אין משחקים.</p>}
        <ul className="space-y-2">
          {games.data?.map((g) => (
            <li key={g.id}>
              <Link to={`/g/${g.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
                <bdi dir="ltr" className="font-num flex-1 font-semibold">
                  {formatGameDate(g.played_on)}
                </bdi>
                <Badge tone={g.status === 'open' ? 'emerald' : 'slate'}>{g.status === 'open' ? 'פתוח' : 'נסגר'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
