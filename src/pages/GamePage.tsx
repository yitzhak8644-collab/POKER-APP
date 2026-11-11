import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../components/Dialog'
import { PayBoxLink } from '../components/PayBoxLink'
import { Badge, btnDanger, btnPrimary, btnSecondary } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { useGameActions } from '../features/game/actions'
import { EntryDialogs, type Pending } from '../features/game/EntryDialogs'
import { LogPanel } from '../features/game/LogPanel'
import { SeatMap } from '../features/game/SeatMap'
import { SettingsPanel } from '../features/game/SettingsPanel'
import { SettlementPanel } from '../features/game/SettlementPanel'
import { TablePanel } from '../features/game/TablePanel'
import { ZeroSumBanner } from '../features/game/ZeroSumBanner'
import { adminDeleteGame } from '../features/games/api'
import { MY_GAMES_KEY, OPEN_GAMES_KEY, useGameBundle, useGameRealtime, useIsAdmin } from '../features/games/hooks'
import { buildLog, buildSnapshot, deriveGame } from '../features/games/mapping'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'

const TABS = [
  { id: 'table', label: 'שולחן' },
  { id: 'seats', label: 'כיסאות' },
  { id: 'log', label: 'יומן' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'settle', label: 'סיום' },
] as const
type TabId = (typeof TABS)[number]['id']

export function GamePage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin().data === true
  const [deleting, setDeleting] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  useGameRealtime(id)
  const { data: bundle, error, isLoading } = useGameBundle(id)
  const actions = useGameActions(id)
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Pending>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [hostDismissed, setHostDismissed] = useState(false)
  const [hostError, setHostError] = useState<string | null>(null)

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const derived = useMemo(() => {
    if (!bundle) return null
    try {
      return { result: deriveGame(bundle), log: buildLog(bundle) }
    } catch {
      return 'inconsistent' as const
    }
  }, [bundle])

  if (isLoading) return <p className="p-6 text-center text-slate-400">טוען…</p>
  if (error || !bundle) return <p className="p-6 text-center text-rose-400">{toHebrewMessage(error)}</p>
  if (derived === 'inconsistent' || derived === null) {
    return <p className="p-6 text-center text-rose-400">הנתונים של המשחק לא עקביים. רעננו את הדף.</p>
  }

  const { result, log } = derived
  const tabParam = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'table'
  const isOwner = session?.user.id === bundle.game.owner_id || isAdmin
  const isOpen = bundle.game.status === 'open'
  const me = bundle.players.find((p) => p.user_id === session?.user.id)
  const hostSlotsTaken = bundle.players.filter((p) => p.role === 'host' || p.role === 'host_spouse').length
  const askHost = isOpen && me !== undefined && !me.host_asked && !hostDismissed
  const answerHost = async (isHost: boolean) => {
    setHostError(null)
    try {
      await actions.answerHostQuestion(id, isHost)
    } catch (err) {
      setHostError(toHebrewMessage(err))
    }
  }
  const pendingName = bundle.players.find((p) => p.id === pending?.playerId)?.display_name ?? ''

  const submitEntry = async (kind: 'buy_in' | 'rebuy', playerId: string, amount: number) => {
    await actions.addTransaction({ gameId: id, playerId, type: kind, amount })
    setPending(null)
    setToast(kind === 'rebuy' ? 'נרשם ✓ עכשיו אפשר לקחת את הז׳יטונים.' : 'נרשם ✓')
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-slate-400" aria-label="חזרה">
          →
        </Link>
        <h1 className="flex-1 text-xl font-bold">
          ערב פוקר ·{' '}
          <bdi dir="ltr" className="font-num">
            {formatGameDate(bundle.game.played_on)}
          </bdi>
        </h1>
        <Badge tone={isOpen ? 'emerald' : 'slate'}>{isOpen ? 'פתוח' : 'נסגר'}</Badge>
      </header>

      <Dialog open={askHost} onClose={() => setHostDismissed(true)} title="האם אתה המארח/ת?">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            {hostSlotsTaken >= 2
              ? 'כבר יש שני מארחים בשולחן.'
              : 'מארח מקבל 5 ₪ מכל אורח. אפשר עד שני מארחים בשולחן.'}
          </p>
          {hostError !== null && (
            <p role="alert" className="text-sm text-rose-400">
              {hostError}
            </p>
          )}
          <div className="flex gap-2">
            {hostSlotsTaken < 2 && (
              <button type="button" className={`${btnPrimary} flex-1`} onClick={() => void answerHost(true)}>
                כן, אני המארח/ת
              </button>
            )}
            <button type="button" className={`${btnSecondary} flex-1`} onClick={() => void answerHost(false)}>
              לא, אני אורח/ת
            </button>
          </div>
        </div>
      </Dialog>

      <PayBoxLink />

      {isAdmin && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-600 bg-amber-950/30 p-2 text-sm">
          <span className="flex-1 text-amber-300">מנהל כללי</span>
          <button type="button" className={btnDanger} onClick={() => setDeleting(true)}>
            מחיקת שולחן
          </button>
        </div>
      )}
      <Dialog open={deleting} onClose={() => setDeleting(false)} title="למחוק את השולחן?" tone="danger">
        <p className="text-sm text-slate-300">השולחן, השחקנים, הרישומים והסיכום יימחקו לצמיתות. אי אפשר לשחזר.</p>
        {deleteError !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {deleteError}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} flex-1`} onClick={() => setDeleting(false)}>
            ביטול
          </button>
          <button
            type="button"
            className={`${btnDanger} flex-1`}
            disabled={deleteBusy}
            onClick={async () => {
              setDeleteBusy(true)
              setDeleteError(null)
              try {
                await adminDeleteGame(id)
                queryClient.removeQueries({ queryKey: ['game', id] })
                void queryClient.invalidateQueries({ queryKey: MY_GAMES_KEY })
                void queryClient.invalidateQueries({ queryKey: OPEN_GAMES_KEY })
                navigate('/', { replace: true })
              } catch (err) {
                setDeleteError(toHebrewMessage(err))
              } finally {
                setDeleteBusy(false)
              }
            }}
          >
            {deleteBusy ? 'מוחק…' : 'כן, מחק'}
          </button>
        </div>
      </Dialog>

      <ZeroSumBanner result={result} />

      <nav className="flex gap-1 rounded-xl bg-slate-900 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`flex-1 whitespace-nowrap rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm ${tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'table' && (
        <TablePanel
          result={result}
          seats={bundle.players}
          canWrite={isOpen}
          onBuyIn={(playerId) => setPending({ kind: 'buy_in', playerId })}
          onRebuy={(playerId) => setPending({ kind: 'rebuy', playerId })}
        />
      )}
      {tab === 'seats' && (
        <SeatMap
          players={bundle.players}
          userId={session?.user.id}
          isOwner={isOwner}
          canWrite={isOpen}
          onSetSeat={actions.setPlayerSeat}
        />
      )}
      {tab === 'log' && <LogPanel log={log} canVoid={isOwner && isOpen} onVoid={actions.voidTransaction} />}
      {tab === 'settings' && (
        <SettingsPanel
          bundle={bundle}
          result={result}
          canManage={isOwner && isOpen}
          onAddPlayer={actions.addPlayer}
          onRemovePlayer={actions.removePlayer}
          onSetRole={actions.setPlayerRole}
        />
      )}
      {tab === 'settle' && (
        <SettlementPanel
          bundle={bundle}
          result={result}
          isOwner={isOwner}
          onCashOut={(playerId, amount, note) => actions.addTransaction({ gameId: id, playerId, type: 'cash_out', amount, note })}
          onVoid={actions.voidTransaction}
          isAdmin={isAdmin}
          onCloseGame={(force) =>
            actions.closeGame(buildSnapshot(result), result.summary ?? 'המשחק נסגר על ידי המנהל הכללי ללא איזון.', force)
          }
        />
      )}

      <EntryDialogs
        pending={pending}
        playerName={pendingName}
        onCancel={() => setPending(null)}
        onSubmit={submitEntry}
      />
      {toast !== null && (
        <div role="status" className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-xl bg-emerald-500 p-3 text-center font-semibold text-slate-950">
          {toast}
        </div>
      )}
    </div>
  )
}
