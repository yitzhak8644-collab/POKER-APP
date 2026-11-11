import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PayBoxLink } from '../components/PayBoxLink'
import { Avatar, Badge, btnPrimary, btnSecondary } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { NotificationPrompt } from '../features/push/NotificationPrompt'
import { createGame, joinOpenGame } from '../features/games/api'
import { MY_GAMES_KEY, MY_PLAYER_KEY, OPEN_GAMES_KEY, useIsAdmin, useMyGames, useMyPlayerGameIds, useOpenGames } from '../features/games/hooks'
import { useAction } from '../hooks/useAction'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate, todayInIsrael } from '../lib/format'

export function HomePage() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const games = useMyGames()
  const openGames = useOpenGames()
  const isAdmin = useIsAdmin().data === true
  const myPlayerIds = useMyPlayerGameIds()
  const joinOpen = useAction()
  const create = useAction()

  const meta = session?.user.user_metadata ?? {}
  const name = (meta.full_name ?? meta.name ?? 'שחקן') as string
  const avatar = (meta.avatar_url ?? meta.picture ?? null) as string | null

  const open = openGames.data ?? []
  const openTable = async () => {
    const r = await create.run(() => createGame(todayInIsrael(), true))
    if (r.ok) {
      void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
      void queryClient.invalidateQueries({ queryKey: OPEN_GAMES_KEY })
      navigate(`/g/${r.value}`)
    }
  }
  const actionError = joinOpen.error ?? create.error

  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <header className="flex items-center gap-3">
        <Avatar name={name} src={avatar} />
        <h1 className="flex-1 text-xl font-bold">
          שלום, {name}
          {isAdmin && <Badge tone="emerald">מנהל כללי</Badge>}
        </h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-slate-400 underline">
          התנתקות
        </button>
      </header>

      <PayBoxLink />

      <NotificationPrompt />

      <section aria-live="polite" className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        {openGames.isLoading && <p className="text-slate-400">טוען…</p>}
        {openGames.error && <p className="text-rose-400">{toHebrewMessage(openGames.error)}</p>}

        {open.map((o) => {
          const isMember = myPlayerIds.data?.includes(o.game_id) ?? false
          return (
            <div key={o.game_id} className="space-y-2">
              <h2 className="font-bold text-emerald-300">יש שולחן פתוח!</h2>
              <p className="text-sm text-slate-300">
                <bdi>{o.owner_name || 'שולחן'}</bdi> ·{' '}
                <bdi dir="ltr" className="font-num">
                  {formatGameDate(o.played_on)}
                </bdi>
              </p>
              {isMember ? (
                <Link to={`/g/${o.game_id}`} className={`${btnPrimary} block w-full text-center`}>
                  כניסה לשולחן
                </Link>
              ) : (
                <button
                  type="button"
                  className={`${btnPrimary} w-full`}
                  disabled={joinOpen.busy}
                  onClick={async () => {
                    const r = await joinOpen.run(() => joinOpenGame(o.game_id))
                    if (r.ok) {
                      void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
                      void queryClient.invalidateQueries({ queryKey: MY_PLAYER_KEY })
                      navigate(`/g/${r.value}`)
                    }
                  }}
                >
                  {joinOpen.busy ? 'מצטרף…' : 'הצטרפות'}
                </button>
              )}
              {isAdmin && !isMember && (
                <Link to={`/g/${o.game_id}`} className={`${btnSecondary} block w-full text-center`}>
                  צפייה בשולחן (מנהל כללי)
                </Link>
              )}
            </div>
          )
        })}

        {openGames.data !== undefined && open.length === 0 && (
          <>
            <h2 className="font-bold">אין שולחן פתוח</h2>
            <button type="button" className={`${btnPrimary} w-full`} disabled={create.busy} onClick={() => void openTable()}>
              {create.busy ? 'פותח…' : 'פתיחת שולחן'}
            </button>
          </>
        )}

        {isAdmin && open.length > 0 && (
          <button type="button" className={`${btnSecondary} w-full`} disabled={create.busy} onClick={() => void openTable()}>
            {create.busy ? 'פותח…' : 'פתיחת שולחן נוסף (מנהל כללי)'}
          </button>
        )}

        {actionError !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {actionError}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">{isAdmin ? 'כל המשחקים' : 'המשחקים שלי'}</h2>
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
