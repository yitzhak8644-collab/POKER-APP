import { useEffect, useRef, useState } from 'react'
import { levelNo, tournamentClock, type Action, type PublicState, type Tournament, type TournamentPlace } from '../../lib/holdem/engine'
import { play } from './sounds'

/** Server time, refreshed every second. */
export function useNow(offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    setNow(Date.now() + offset)
    const id = setInterval(() => setNow(Date.now() + offset), 1000)
    return () => clearInterval(id)
  }, [offset])
  return now
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const playersLeft = (pub: PublicState): number => pub.seats.filter((s) => s !== null).length

/** Header line: level, blinds in play, time to the next level, players left. */
export function TournamentHeader({ pub, offset }: { pub: PublicState; offset: number }) {
  const t = pub.tournament as Tournament
  const now = useNow(offset)
  const c = tournamentClock(t, now)
  if (t.status === 'registering') {
    return (
      <>
        <span className="me-1 rounded-full bg-amber-900/60 px-2 py-0.5 text-amber-200">🏆 טורניר</span>
        הרשמה ·{' '}
        <bdi dir="ltr" className="font-num">
          {playersLeft(pub)}
        </bdi>{' '}
        נרשמו
      </>
    )
  }
  return (
    <>
      <span className="me-1 rounded-full bg-amber-900/60 px-2 py-0.5 text-amber-200">🏆 רמה {c.index + 1}</span>
      <bdi dir="ltr" className="font-num">
        {pub.config.sb}/{pub.config.bb}
      </bdi>
      {c.nextAt !== null && (
        <>
          {' '}
          · עולה בעוד{' '}
          <bdi dir="ltr" className="font-num">
            {mmss(c.nextAt - now)}
          </bdi>
        </>
      )}{' '}
      · נשארו{' '}
      <bdi dir="ltr" className="font-num">
        {playersLeft(pub)}
      </bdi>
    </>
  )
}

interface Toast {
  key: number
  text: string
  tone: 'level' | 'out'
}

/** Short banners over the table: the blinds are going up, somebody was knocked out. */
export function TournamentToasts({ pub, offset }: { pub: PublicState; offset: number }) {
  const t = pub.tournament as Tournament
  const now = useNow(offset)
  const index = t.status === 'running' ? tournamentClock(t, now).index : -1
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef<{ index: number; out: number } | null>(null)
  const key = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const prev = seen.current
    seen.current = { index, out: t.out.length }
    if (prev === null) return
    const add: Toast[] = []
    if (index > prev.index && prev.index >= 0) {
      const l = levelNo(t, index)
      add.push({
        key: ++key.current,
        text: `הבליינדים עולים: ${l.sb}/${l.bb} מהיד הבאה`,
        tone: 'level',
      })
    }
    for (const o of t.out.slice(prev.out))
      add.push({
        key: ++key.current,
        text: `${o.name} הודח · מקום ${o.place}`,
        tone: 'out',
      })
    if (add.length === 0) return
    play(add.some((a) => a.tone === 'out') ? 'fold' : 'bonus')
    setToasts((cur) => [...cur, ...add])
    const ids = add.map((a) => a.key)
    timers.current.add(setTimeout(() => setToasts((cur) => cur.filter((x) => !ids.includes(x.key))), 4500))
  }, [index, t])

  useEffect(() => {
    const all = timers.current
    return () => {
      for (const id of all) clearTimeout(id)
    }
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-1.5 px-4" dir="rtl" aria-live="polite">
      {toasts.map((x) => (
        <p
          key={x.key}
          className={`rounded-full px-4 py-1.5 text-sm font-bold shadow-lg ${x.tone === 'out' ? 'bg-rose-950/90 text-rose-100 ring-1 ring-rose-700' : 'bg-amber-950/90 text-amber-100 ring-1 ring-amber-600'}`}
        >
          <bdi>{x.text}</bdi>
        </p>
      ))}
    </div>
  )
}

/** Before the start: who registered, and the start button for the opener. */
export function RegisterPanel({
  pub,
  me,
  canStart,
  act,
  busy,
}: {
  pub: PublicState
  me: string
  canStart: boolean
  act: (a: Action) => Promise<boolean>
  busy: boolean
}) {
  const t = pub.tournament as Tournament
  const names = pub.seats.flatMap((s) => (s === null ? [] : [s.userId === me ? `${s.name} (אתה)` : s.name]))
  const owner = pub.seats.find((s) => s?.userId === pub.ownerId)?.name ?? 'הפותח'
  return (
    <div
      className="absolute inset-x-4 top-1/2 z-20 -translate-y-1/2 space-y-3 rounded-2xl border border-amber-700/60 bg-slate-950/92 p-4 text-center shadow-2xl"
      dir="rtl"
    >
      <h2 className="text-lg font-bold text-amber-200">🏆 טורניר · הרשמה</h2>
      <p className="text-xs text-slate-300">
        כניסה {pub.config.buyin} צ׳יפים · בליינדים מתחילים ב-{levelNo(t, 0).sb}/{levelNo(t, 0).bb} ועולים כל {t.levelMs / 60_000} דקות ·
        ריביי ב-
        {t.rebuyLevels} הרמות הראשונות · אפשר להצטרף עד סוף הרמה הראשונה
      </p>
      <p className="text-sm">
        נרשמו ({names.length}): <bdi>{names.join(', ') || '—'}</bdi>
      </p>
      {canStart ? (
        <button
          type="button"
          className="hl-btn brass w-full"
          disabled={busy || names.length < 2}
          onClick={() => void act({ type: 'start' })}
        >
          {names.length < 2 ? 'ממתינים לשחקן נוסף…' : 'התחל טורניר'}
        </button>
      ) : (
        <p className="text-xs text-slate-400">
          ממתינים ש-<bdi>{owner}</bdi> יתחיל את הטורניר.
        </p>
      )}
    </div>
  )
}

function PlaceRow({ p, me }: { p: TournamentPlace; me: string }) {
  const medal = p.place === 1 ? '🏆' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : ''
  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-3 py-2 ${p.place === 1 ? 'bg-amber-950/60 ring-1 ring-amber-600' : 'bg-slate-900'}`}
    >
      <span className="w-8 text-center font-num font-bold tabular-nums" dir="ltr">
        {medal || p.place}
      </span>
      <bdi className="flex-1 truncate">{p.userId === me ? `${p.name} (אתה)` : p.name}</bdi>
      {p.entries > 1 && <span className="text-xs text-slate-400">{p.entries} כניסות</span>}
    </li>
  )
}

/** Final places (also shown when the table is opened after it ended). */
export function TournamentResults({ pub, me }: { pub: PublicState; me: string }) {
  const t = pub.tournament as Tournament
  if (t.status === 'cancelled') return <p className="text-sm text-slate-400">הטורניר בוטל לפני שהסתיים, ולכן אין תוצאות.</p>
  const places = [...(t.winner ? [t.winner] : []), ...[...t.out].reverse()]
  return (
    <div className="space-y-3">
      {t.winner && (
        <p className="text-center text-lg font-bold text-amber-200">
          🏆 <bdi>{t.winner.userId === me ? 'זכית בטורניר!' : `${t.winner.name} זכה בטורניר!`}</bdi>
        </p>
      )}
      <ol className="space-y-1.5 text-sm">
        {places.map((p) => (
          <PlaceRow key={p.userId} p={p} me={me} />
        ))}
      </ol>
    </div>
  )
}

/** Menu: players still in (by chips), who is out (by place), and the blind structure. */
export function TournamentStandings({ pub, me, offset }: { pub: PublicState; me: string; offset: number }) {
  const t = pub.tournament as Tournament
  const now = useNow(offset)
  const c = tournamentClock(t, now)
  const inPlay = pub.seats.flatMap((s) => (s === null ? [] : [s])).sort((a, b) => b.stack + b.bet - (a.stack + a.bet))
  const shown = Math.max(c.index + 4, 8)
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-1">
        {inPlay.map((s, i) => (
          <li key={s.userId} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5">
            <span className="w-5 text-center font-num text-slate-400" dir="ltr">
              {i + 1}
            </span>
            <bdi className="flex-1 truncate">
              {s.userId === me ? `${s.name} (אתה)` : s.name}
              {s.sittingOut && <span className="text-xs text-amber-300"> · בחוץ</span>}
              {s.stack + s.bet === 0 && <span className="text-xs text-rose-300"> · מחליט על ריביי</span>}
            </bdi>
            <span className="font-num font-bold tabular-nums" dir="ltr">
              {s.stack + s.bet}
            </span>
          </li>
        ))}
        {[...t.out].reverse().map((p) => (
          <li key={p.userId} className="flex items-center gap-2 px-3 py-1 text-slate-500">
            <span className="w-5 text-center font-num" dir="ltr">
              {p.place}
            </span>
            <bdi className="flex-1 truncate">{p.userId === me ? `${p.name} (אתה)` : p.name}</bdi>
            <span className="text-xs">הודח</span>
          </li>
        ))}
      </ol>
      <div>
        <p className="mb-1 text-xs text-slate-400">
          מבנה הבליינדים (כל {t.levelMs / 60_000} דקות)
          {c.rebuyOpen ? ' · ריביי פתוח' : t.status === 'running' ? ' · ריביי נסגר' : ''}
          {c.lateRegOpen && t.status === 'running' ? ' · הרשמה מאוחרת פתוחה' : ''}
        </p>
        <div className="grid grid-cols-4 gap-1 text-center text-xs" dir="ltr">
          {Array.from({ length: shown }, (_, i) => {
            const l = levelNo(t, i)
            const cur = t.status === 'running' && i === c.index
            return (
              <span
                key={i}
                className={`rounded px-1 py-0.5 font-num ${cur ? 'bg-amber-700 text-white' : i < c.index && t.status === 'running' ? 'text-slate-600' : 'bg-slate-900 text-slate-300'}`}
              >
                {l.sb}/{l.bb}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
