import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { btnSecondary, Money } from '../components/ui'
import { toHebrewMessage } from '../lib/errors'
import { formatGameDate } from '../lib/format'
import { getSupabase } from '../lib/supabase'

export interface HistoryGame {
  game_id: string
  played_on: string
  closed_at: string | null
  host_name: string | null
  players: number
  pot: number | string
  summary: string | null
}

async function fetchHistory(): Promise<HistoryGame[]> {
  const { data, error } = await getSupabase().rpc('game_history')
  if (error) throw error
  return (data ?? []) as HistoryGame[]
}

/** Every closed table, for everybody: date, host, players, pot and the WhatsApp summary. */
export function HistoryPage() {
  const q = useQuery({ queryKey: ['game-history'], queryFn: fetchHistory })
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-400 underline">
          חזרה
        </Link>
        <h1 className="flex-1 text-xl font-bold">היסטוריית משחקים</h1>
      </header>
      {q.isLoading && <p className="text-slate-400">טוען…</p>}
      {q.error && <p className="text-rose-400">{toHebrewMessage(q.error)}</p>}
      {q.data?.length === 0 && <p className="text-slate-400">עוד אין משחקים שנסגרו.</p>}
      <ul className="space-y-2">
        {q.data?.map((g) => (
          <HistoryItem key={g.game_id} g={g} />
        ))}
      </ul>
    </main>
  )
}

export function HistoryItem({ g, initiallyOpen = false }: { g: HistoryGame; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-900">
      <button type="button" className="flex w-full items-center gap-3 p-3 text-start" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <bdi dir="ltr" className="font-num">
              {formatGameDate(g.played_on)}
            </bdi>
            {g.host_name && (
              <span className="text-sm font-normal text-slate-400">
                {' '}
                · אצל <bdi>{g.host_name}</bdi>
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {g.players} שחקנים · קופה <Money value={Number(g.pot)} />
          </p>
        </div>
        <span className="text-slate-500" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-800 p-3">
          {g.summary ? (
            <>
              <pre dir="rtl" className="whitespace-pre-wrap text-sm leading-relaxed">
                {g.summary}
              </pre>
              <a
                className={`${btnSecondary} block text-center`}
                href={`https://wa.me/?text=${encodeURIComponent(g.summary)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                שליחה בוואטסאפ
              </a>
            </>
          ) : (
            <p className="text-sm text-slate-400">אין סיכום שמור למשחק הזה.</p>
          )}
        </div>
      )}
    </li>
  )
}
