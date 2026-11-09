import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PayBoxLink } from '../components/PayBoxLink'
import { Avatar, Badge, btnPrimary } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { createGame, joinOpenGame } from '../features/games/api'
import { MY_GAMES_KEY, OPEN_GAMES_KEY, useMyGames, useOpenGames } from '../features/games/hooks'
import { useAction } from '../hooks/useAction'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate, todayInIsrael } from '../lib/format'

export function HomePage() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const games = useMyGames()
  const openGames = useOpenGames()
  const joinOpen = useAction()
  const openGame = openGames.data?.[0]
  const isMember = openGame !== undefined && (games.data?.some((g) => g.id === openGame.game_id) ?? false)
  const create = useAction()

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

      <section aria-live="polite" className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        {openGames.isLoading && <p className="text-slate-400">טוען…</p>}
        {openGames.error && <p className="text-rose-400">{toHebrewMessage(openGames.error)}</p>}
        {openGame !== undefined && (
          <>
            <h2 className="font-bold text-emerald-300">יש שולחן פתוח!</h2>
            <p className="text-sm text-slate-300">
              <bdi>{openGame.owner_name || 'שולחן'}</bdi> ·{' '}
              <bdi dir="ltr" className="font-num">
                {formatGameDate(openGame.played_on)}
              </bdi>
            </p>
            {isMember ? (
              <Link to={`/g/${openGame.game_id}`} className={`${btnPrimary} w-full`}>
                כניסה לשולחן
              </Link>
            ) : (
              <button
                type="button"
                className={`${btnPrimary} w-full`}
                disabled={joinOpen.busy}
                onClick={async () => {
                  const r = await joinOpen.run(() => joinOpenGame(openGame.game_id))
                  if (r.ok) {
                    void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
                    navigate(`/g/${r.value}`)
                  }
                }}
              >
                {joinOpen.busy ? 'מצטרף…' : 'הצטרפות'}
              </button>
            )}
          </>
        )}
        {openGames.data !== undefined && openGame === undefined && (
          <>
            <h2 className="font-bold">אין שולחן פתוח</h2>
            <button
              type="button"
              className={`${btnPrimary} w-full`}
              disabled={create.busy}
              onClick={async () => {
                const r = await create.run(() => createGame(todayInIsrael(), true))
                if (r.ok) {
                  void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
                  void queryClient.invalidateQueries({ queryKey: OPEN_GAMES_KEY })
                  navigate(`/g/${r.value}`)
                }
              }}
            >
              {create.busy ? 'פותח…' : 'פתיחת שולחן'}
            </button>
          </>
        )}
        {(joinOpen.error ?? create.error) !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {joinOpen.error ?? create.error}
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
