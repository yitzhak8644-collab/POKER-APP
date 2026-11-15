import { useEffect, useState } from 'react'
import type { HandSummary } from '../../lib/holdem/engine'
import { toHebrewMessage } from '../../lib/errors'
import type { HoldemBackend } from './backend'
import { PlayingCard } from './pieces'

/** The last hands of the table: board, who won what and with which hand. Only cards that were shown. */
export function HandHistory({ backend, me, refreshKey }: { backend: HoldemBackend; me: string; refreshKey: number }) {
  const [hands, setHands] = useState<HandSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    backend
      .history()
      .then((h) => {
        if (live) setHands(h)
      })
      .catch((err: unknown) => {
        if (live) setError(toHebrewMessage(err))
      })
    return () => {
      live = false
    }
  }, [backend, refreshKey])

  if (error !== null) return <p className="text-sm text-rose-400">{error}</p>
  if (hands === null) return <p className="text-sm text-slate-400">טוען…</p>
  if (hands.length === 0) return <p className="text-sm text-slate-400">עוד לא הסתיימה אף יד בשולחן הזה.</p>

  return (
    <ol className="max-h-[60dvh] space-y-3 overflow-y-auto pe-1">
      {hands.map((h) => {
        const winners = h.players.filter((p) => p.won)
        const shown = h.players.filter((p) => p.cards !== null)
        const mine = h.players.find((p) => p.userId === me)
        return (
          <li key={h.handNo} className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                יד{' '}
                <bdi dir="ltr" className="font-num">
                  {h.handNo}
                </bdi>
              </span>
              <span className="text-xs text-slate-400">
                קופה{' '}
                <bdi dir="ltr" className="font-num">
                  {h.pot}
                </bdi>
                {h.bonus > 0 && <span className="ms-2 rounded-full bg-amber-900/60 px-2 text-amber-200">7-2 · +{h.bonus}</span>}
              </span>
            </div>
            {h.board.length > 0 && (
              <div className="flex gap-1" dir="ltr">
                {h.board.map((c) => (
                  <PlayingCard key={c} card={c} width={26} />
                ))}
              </div>
            )}
            <p className="text-slate-300">
              {winners.map((w, i) => (
                <span key={w.userId}>
                  {i > 0 && ', '}
                  <bdi className="font-bold text-emerald-300">{w.userId === me ? 'אתה' : w.name}</bdi>
                  {w.label && <> · {w.label}</>}
                  {' · '}
                  <bdi dir="ltr" className="font-num">
                    +{w.net}
                  </bdi>
                </span>
              ))}
              {!h.showdown && <span className="text-slate-500"> (כולם פרשו)</span>}
            </p>
            {shown.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {shown.map((p) => (
                  <span key={p.userId} className="flex items-center gap-1 text-xs text-slate-400">
                    <bdi>{p.userId === me ? 'אתה' : p.name}</bdi>
                    <span className="flex gap-0.5" dir="ltr">
                      {(p.cards ?? []).map((c) => (
                        <PlayingCard key={c} card={c} width={20} />
                      ))}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {mine && !mine.won && (
              <p className="text-xs text-slate-500">
                אתה:{' '}
                <bdi dir="ltr" className="font-num">
                  {mine.net}
                </bdi>
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
