import type { GameResult } from '../../lib/finance'
import { ChipLegend } from '../../components/ChipStack'
import { Avatar, Badge, btnSecondary, Money } from '../../components/ui'
import type { GamePlayerRow } from '../games/types'
import { ROLE_LABEL } from './labels'

interface Props {
  result: GameResult
  seats: readonly GamePlayerRow[]
  canWrite: boolean
  onBuyIn: (playerId: string) => void
  onRebuy: (playerId: string) => void
}

export function TablePanel({ result, seats, canWrite, onBuyIn, onRebuy }: Props) {
  const avatarOf = new Map(seats.map((s) => [s.id, s.avatar_url]))
  const seatOf = new Map(seats.map((s) => [s.id, s.seat]))
  const host = result.players.find((p) => p.role === 'host')
  return (
    <div className="space-y-4">
      {result.players.length === 0 && <p className="text-slate-400">עדיין אין שחקנים. הוסיפו בלשונית ההגדרות או שתפו את קוד ההצטרפות.</p>}
      <ul className="space-y-2">
        {result.players.map((p) => (
          <li key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={p.name} src={avatarOf.get(p.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.role !== 'guest' && <Badge tone="amber">{ROLE_LABEL[p.role]}</Badge>}
                  {seatOf.get(p.id) != null && <Badge>כיסא {seatOf.get(p.id)}</Badge>}
                </div>
                <div className="text-sm text-slate-400">
                  הכניס <Money value={p.invested} />
                  {p.cashOut !== null && (
                    <>
                      {' · '}יצא עם <Money value={p.cashOut} />
                    </>
                  )}
                </div>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={btnSecondary} onClick={() => onBuyIn(p.id)}>
                    Buy-in
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => onRebuy(p.id)}>
                    Rebuy
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm">
        <dt className="text-slate-400">קופת המשחק</dt>
        <dd className="text-end">
          <Money value={result.pot} />
        </dd>
        <dt className="text-slate-400">קופה קבוצתית (PayBox)</dt>
        <dd className="text-end">
          <Money value={result.fees.groupFund} />
        </dd>
        <dt className="text-slate-400">מארח</dt>
        <dd className="text-end">
          {host ? (
            <>
              {host.name} · מקבל <Money value={result.fees.hostPayout} />
            </>
          ) : (
            'ללא מארח (מקום ניטרלי)'
          )}
        </dd>
      </dl>
      <ChipLegend />
    </div>
  )
}
