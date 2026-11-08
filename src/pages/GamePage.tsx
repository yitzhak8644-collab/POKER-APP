import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { useGameActions } from '../features/game/actions'
import { EntryDialogs, type Pending } from '../features/game/EntryDialogs'
import { LogPanel } from '../features/game/LogPanel'
import { SettingsPanel } from '../features/game/SettingsPanel'
import { TablePanel } from '../features/game/TablePanel'
import { ZeroSumBanner } from '../features/game/ZeroSumBanner'
import { useGameBundle, useGameRealtime } from '../features/games/hooks'
import { buildLog, defaultBuyInAmount, deriveGame } from '../features/games/mapping'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'

const TABS = [
  { id: 'table', label: 'שולחן' },
  { id: 'log', label: 'יומן' },
  { id: 'settings', label: 'הגדרות' },
] as const
type TabId = (typeof TABS)[number]['id']

export function GamePage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  useGameRealtime(id)
  const { data: bundle, error, isLoading } = useGameBundle(id)
  const actions = useGameActions(id)
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Pending>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const derived = useMemo(() => {
    if (!bundle) return null
    try {
      return { result: deriveGame(bundle), log: buildLog(bundle), defaultAmount: defaultBuyInAmount(bundle.transactions) }
    } catch {
      return 'inconsistent' as const
    }
  }, [bundle])

  if (isLoading) return <p className="p-6 text-center text-slate-400">טוען…</p>
  if (error || !bundle) return <p className="p-6 text-center text-rose-400">{toHebrewMessage(error)}</p>
  if (derived === 'inconsistent' || derived === null) {
    return <p className="p-6 text-center text-rose-400">הנתונים של המשחק לא עקביים. רעננו את הדף.</p>
  }

  const { result, log, defaultAmount } = derived
  const tabParam = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'table'
  const isOwner = session?.user.id === bundle.game.owner_id
  const isOpen = bundle.game.status === 'open'
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

      <ZeroSumBanner result={result} />

      <nav className="flex gap-1 rounded-xl bg-slate-900 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
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
          onBuyIn={(playerId) => setPending({ kind: 'buy_in', playerId, step: 'amount' })}
          onRebuy={(playerId) => setPending({ kind: 'rebuy', playerId, step: 'warn' })}
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

      <EntryDialogs
        pending={pending}
        playerName={pendingName}
        defaultAmount={defaultAmount}
        onCancel={() => setPending(null)}
        onContinue={() => setPending((p) => (p ? { ...p, step: 'amount' } : p))}
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
