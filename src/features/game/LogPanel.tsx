import { Avatar, Badge, btnSecondary, Money } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { formatDateTime } from '../../lib/format'
import type { LogEntry } from '../games/mapping'
import { TX_LABEL } from './labels'

interface Props {
  log: readonly LogEntry[]
  /** Table manager of an open game: may void entries. */
  canVoid: boolean
  onVoid: (id: string) => Promise<void>
}

/** Audit log: every entry shows who it was for, who logged it, and when. */
export function LogPanel({ log, canVoid, onVoid }: Props) {
  const { run, busy, error } = useAction()
  if (log.length === 0) return <p className="text-slate-400">עדיין לא נרשמו כניסות.</p>
  return (
    <div className="space-y-3">
      {error !== null && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {log.map((e) => (
          <li key={e.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start gap-3">
              <Avatar name={e.playerName} src={e.playerAvatar} />
              <div className={`min-w-0 flex-1 ${e.voided ? 'text-slate-500 line-through' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.playerName}</span>
                  <Badge tone={e.type === 'cash_out' ? 'emerald' : e.type === 'rebuy' ? 'amber' : 'slate'}>
                    {TX_LABEL[e.type]}
                  </Badge>
                  <Money value={e.amount} className="font-semibold" />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 no-underline">
                  <Avatar name={e.actorName} src={e.actorAvatar} size="sm" />
                  <span>נרשם ע״י {e.actorName}</span>
                  <span aria-hidden="true">·</span>
                  <bdi dir="ltr" className="font-num">
                    {formatDateTime(e.at)}
                  </bdi>
                </div>
              </div>
              {canVoid && !e.voided && (
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(() => onVoid(e.id))}>
                  בטל
                </button>
              )}
            </div>
            {e.voided && (
              <p className="mt-2 text-xs text-rose-300">
                בוטל{e.voidedByName ? ` ע״י ${e.voidedByName}` : ''}
                {e.voidedAt && (
                  <>
                    {' · '}
                    <bdi dir="ltr" className="font-num">
                      {formatDateTime(e.voidedAt)}
                    </bdi>
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
