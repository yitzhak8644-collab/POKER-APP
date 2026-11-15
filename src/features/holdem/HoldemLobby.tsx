import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, btnPrimary, btnSecondary } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { toHebrewMessage } from '../../lib/errors'
import { createHoldemTable, fetchHoldemOpenToAll, fetchOpenHoldemTable } from './backend'

const OPEN_KEY = ['holdem-open'] as const

/**
 * Home-page card for the online Hold'em table. While the feature is in its trial only an admin can open
 * a table (public.holdem_settings.open_to_all); once a table is open everybody sees it and can join.
 */
export function HoldemLobby({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const open = useQuery({ queryKey: OPEN_KEY, queryFn: fetchOpenHoldemTable, refetchInterval: 10_000, staleTime: 0 })
  const toAll = useQuery({ queryKey: ['holdem-open-to-all'], queryFn: fetchHoldemOpenToAll, staleTime: 60_000 })
  const create = useAction()

  const table = open.data ?? null
  const mayOpen = isAdmin || toAll.data === true
  if (table === null && !mayOpen) return null

  const players = table ? table.pub.seats.filter((s) => s !== null) : []

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-900/60 bg-gradient-to-b from-emerald-950/50 to-slate-900 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        הולדם אונליין
        <Badge tone="amber">ניסיון · צ׳יפים בלבד</Badge>
      </h2>

      {open.error && <p className="text-sm text-rose-400">{toHebrewMessage(open.error)}</p>}

      {table ? (
        <>
          <p className="text-sm text-slate-300">
            יש שולחן פתוח ·{' '}
            <bdi dir="ltr" className="font-num">
              {players.length}/{table.pub.seats.length}
            </bdi>{' '}
            שחקנים
            {players.length > 0 && (
              <>
                : <bdi>{players.map((s) => s?.name).join(', ')}</bdi>
              </>
            )}
          </p>
          <Link to={`/holdem/${table.id}`} className={`${btnPrimary} block w-full text-center`}>
            כניסה לשולחן האונליין
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-400">כל אחד משחק מהטלפון שלו. כניסה 250 צ׳יפים, בליינדים 5/5, בלי כסף.</p>
          <button
            type="button"
            className={`${btnPrimary} w-full`}
            disabled={create.busy}
            onClick={async () => {
              const r = await create.run(createHoldemTable)
              if (r.ok) {
                void queryClient.invalidateQueries({ queryKey: OPEN_KEY })
                navigate(`/holdem/${r.value}`)
              }
            }}
          >
            {create.busy ? 'פותח…' : 'פתיחת שולחן אונליין'}
          </button>
        </>
      )}

      {create.error !== null && (
        <p role="alert" className="text-sm text-rose-400">
          {create.error}
        </p>
      )}

      <Link to="/holdem/practice" className={`${btnSecondary} block w-full text-center`}>
        אימון מול בוטים (רק אצלך במכשיר)
      </Link>
    </section>
  )
}
