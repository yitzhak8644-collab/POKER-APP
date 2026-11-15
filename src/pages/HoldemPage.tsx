import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { btnDanger, btnPrimary, btnSecondary } from '../components/ui'
import { useAuth } from '../features/auth/AuthProvider'
import { useIsAdmin } from '../features/games/hooks'
import { ActionBar } from '../features/holdem/ActionBar'
import { LocalBackend, REACTIONS, RemoteBackend, type HoldemBackend } from '../features/holdem/backend'
import { HandHistory } from '../features/holdem/HandHistory'
import { useSoundSetting, useTableSounds } from '../features/holdem/sounds'
import { TableView } from '../features/holdem/TableView'
import { useHoldem } from '../features/holdem/useHoldem'
import '../features/holdem/holdem.css'
import { seatIndexOf, type PublicState } from '../lib/holdem/engine'

/** The online Texas Hold'em table. `practice` runs the same game locally against bots. */
export function HoldemPage({ practice = false }: { practice?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const isAdmin = useIsAdmin().data === true
  const uid = session?.user.id ?? ''
  const meta = session?.user.user_metadata ?? {}
  const name = String(meta.full_name ?? meta.name ?? 'אתה')
  const avatar = (meta.avatar_url ?? meta.picture ?? null) as string | null

  const [backend, setBackend] = useState<HoldemBackend | null>(null)
  const [missing, setMissing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [picker, setPicker] = useState(false)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; key: number }>>({})
  const reactKey = useRef(0)
  const [soundOn, setSoundOn] = useSoundSetting()

  useEffect(() => {
    setMissing(false)
    if (!practice && (!id || !uid)) return
    // Development only: /dev/holdem?turn=5 shortens the turn timer to try timeouts quickly.
    const turn = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('turn')) || undefined : undefined
    const b: HoldemBackend = practice ? new LocalBackend(name, avatar, turn) : new RemoteBackend(id as string, uid, () => setMissing(true))
    setBackend(b)
    return () => {
      b.dispose()
      setBackend(null)
    }
  }, [practice, id, uid, name, avatar])

  useEffect(() => {
    if (!backend) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const off = backend.onReact((userId, emoji) => {
      const key = ++reactKey.current
      setReactions((r) => ({ ...r, [userId]: { emoji, key } }))
      const t = setTimeout(() => {
        timers.delete(t)
        setReactions((r) => {
          if (r[userId]?.key !== key) return r
          const next = { ...r }
          delete next[userId]
          return next
        })
      }, 2300)
      timers.add(t)
    })
    return () => {
      off()
      for (const t of timers) clearTimeout(t)
    }
  }, [backend])

  const { snap, act, busy, error } = useHoldem(backend)
  useTableSounds(snap, backend?.me ?? '')

  if (missing) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p className="text-slate-300">השולחן לא נמצא.</p>
        <Link to="/" className={`${btnPrimary} inline-block`}>
          חזרה לדף הבית
        </Link>
      </main>
    )
  }
  if (!backend || !snap) {
    return (
      <main className="hl-root flex h-dvh items-center justify-center">
        <p className="text-slate-400">טוען את השולחן…</p>
      </main>
    )
  }

  const { pub, cards } = snap
  const me = backend.me
  const mySeat = seatIndexOf(pub, me)
  const seat = mySeat >= 0 ? (pub.seats[mySeat] ?? null) : null
  const canClose = !practice && (pub.ownerId === me || isAdmin)
  const players = pub.seats.filter((s) => s !== null).length

  const goHome = async (how: 'keep' | 'leave'): Promise<void> => {
    if (!practice && seat) {
      if (how === 'leave') await act({ type: 'leave' })
      else if (!seat.sittingOut) await act({ type: 'sit_out' })
    }
    navigate('/')
  }
  // Leaving in the middle of a hand folds it, so that one asks first.
  const inHand = seat !== null && pub.phase === 'hand' && seat.inHand && !seat.folded
  const exit = (): void => {
    setMenu(false)
    if (inHand && !practice) setConfirmExit(true)
    else void goHome('leave')
  }

  if (pub.closed) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4" dir="rtl">
        <h1 className="text-xl font-bold">השולחן נסגר</h1>
        <p className="text-sm text-slate-400">משחק בצ׳יפים בלבד. התוצאה לא נכנסת לטבלת האיזון.</p>
        <Standings pub={pub} me={me} />
        <Link to="/" className={`${btnPrimary} block w-full text-center`}>
          חזרה לדף הבית
        </Link>
      </main>
    )
  }

  return (
    <main className="hl-root mx-auto flex h-dvh max-w-md flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] text-xs text-slate-300" dir="rtl">
        <button type="button" className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5" onClick={() => setMenu(true)}>
          תפריט
        </button>
        <p className="text-center">
          {practice && <span className="me-1 rounded-full bg-amber-900/60 px-2 py-0.5 text-amber-200">אימון מול בוטים</span>}
          בליינדים{' '}
          <bdi dir="ltr" className="font-num">
            {pub.config.sb}/{pub.config.bb}
          </bdi>
          {' '}·{' '}
          <bdi dir="ltr" className="font-num">
            {players}/{pub.seats.length}
          </bdi>
          {pub.handNo > 0 && (
            <>
              {' '}
              · יד{' '}
              <bdi dir="ltr" className="font-num">
                {pub.handNo}
              </bdi>
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5"
            onClick={() => setSoundOn(!soundOn)}
            aria-label={soundOn ? 'השתקת צלילים' : 'הפעלת צלילים'}
            aria-pressed={soundOn}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button type="button" className="rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-1.5 text-rose-200" onClick={exit}>
            יציאה
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <TableView
          pub={pub}
          me={me}
          cards={cards}
          offset={backend.offset()}
          reactions={reactions}
          onSit={seat === null ? (i) => void act({ type: 'sit', seat: i }) : undefined}
        />
        {seat && (
          <>
            <button type="button" className="hl-emoji-btn" onClick={() => setPicker((p) => !p)} aria-label="תגובה" aria-expanded={picker}>
              😀
            </button>
            {picker && (
              <div className="hl-emoji-row">
                {REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      backend.react(e)
                      setPicker(false)
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ActionBar pub={pub} me={me} cards={cards} offset={backend.offset()} act={act} busy={busy} error={error} onFinish={() => void goHome('leave')} />

      <Dialog open={menu} onClose={() => setMenu(false)} title="שולחן הולדם">
        <div className="space-y-3" dir="rtl">
          <p className="text-xs text-slate-400">
            כניסה וריביי: {pub.config.buyin} צ׳יפים · בליינדים {pub.config.sb}/{pub.config.bb} · {pub.config.turnMs / 1000} שניות לתור · צ׳יפים בלבד,
            בלי כסף.
          </p>
          <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            חוק 7-2: מי שזוכה בקופה עם 7-2 מקבל {pub.config.sevenDeuceBonus ?? 40} צ׳יפים מכל מי שיושב בשולחן. הקלפים שלו נחשפים לכולם.
          </p>
          <button type="button" className={`${btnSecondary} w-full text-rose-200`} disabled={busy} onClick={exit}>
            {practice ? 'יציאה מהאימון' : seat ? 'יציאה מהשולחן (הצ׳יפים נשמרים)' : 'יציאה לדף הבית'}
          </button>
          <button
            type="button"
            className={`${btnSecondary} w-full`}
            onClick={() => {
              setMenu(false)
              setHistoryOpen(true)
            }}
          >
            היסטוריית ידיים
          </button>
          <button type="button" className={`${btnSecondary} w-full`} onClick={() => setSoundOn(!soundOn)}>
            צלילים: {soundOn ? 'פועלים 🔊' : 'כבויים 🔇'}
          </button>
          <Standings pub={pub} me={me} />
          {seat && !seat.leaving && !practice && (
            <button
              type="button"
              className={`${btnSecondary} w-full`}
              disabled={busy}
              onClick={() => {
                void act(seat.sittingOut ? { type: 'sit_in' } : { type: 'sit_out' })
                setMenu(false)
              }}
            >
              {seat.sittingOut ? 'חזרתי לשחק' : seat.sitOutNext ? 'תשב בחוץ בסוף היד' : 'לשבת בחוץ (הכיסא נשמר)'}
            </button>
          )}
          {seat && !practice && (
            <button type="button" className={`${btnSecondary} w-full`} disabled={busy} onClick={() => void goHome('keep')}>
              הפסקה: לדף הבית והכיסא נשמר
            </button>
          )}
          {canClose &&
            (confirmClose ? (
              <button
                type="button"
                className={`${btnDanger} w-full`}
                disabled={busy}
                onClick={() => {
                  void act({ type: 'close' })
                  setMenu(false)
                }}
              >
                בטוח? זה סוגר את השולחן לכולם
              </button>
            ) : (
              <button type="button" className={`${btnSecondary} w-full text-rose-300`} onClick={() => setConfirmClose(true)}>
                סגירת השולחן
              </button>
            ))}
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => setMenu(false)}>
            חזרה למשחק
          </button>
        </div>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="היסטוריית ידיים">
        <div className="space-y-3" dir="rtl">
          {historyOpen && <HandHistory backend={backend} me={me} refreshKey={pub.handNo} />}
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => setHistoryOpen(false)}>
            חזרה למשחק
          </button>
        </div>
      </Dialog>

      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title="לצאת מהשולחן?">
        <div className="space-y-3" dir="rtl">
          <p className="text-sm text-slate-300">אתה באמצע יד. אם תצא עכשיו היד שלך תתקפל. הצ׳יפים שלך נשמרים ואפשר לחזור לשולחן מתי שתרצה.</p>
          <div className="flex gap-2">
            <button type="button" className={`${btnSecondary} flex-1`} onClick={() => setConfirmExit(false)}>
              להישאר
            </button>
            <button
              type="button"
              className={`${btnDanger} flex-1`}
              disabled={busy}
              onClick={() => {
                setConfirmExit(false)
                void goHome('leave')
              }}
            >
              יציאה
            </button>
          </div>
        </div>
      </Dialog>
    </main>
  )
}

/** Chips bought, chips now, and the difference, best first. */
function Standings({ pub, me }: { pub: PublicState; me: string }) {
  if (pub.standings.length === 0) return null
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500">
          <th className="py-1 text-start font-normal">שחקן</th>
          <th className="py-1 text-end font-normal">קנה</th>
          <th className="py-1 text-end font-normal">יש</th>
          <th className="py-1 text-end font-normal">נטו</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {pub.standings.map((s) => {
          const net = s.stack - s.bought
          return (
            <tr key={s.userId} className={s.seated ? '' : 'text-slate-500'}>
              <td className="max-w-[9rem] truncate py-1.5">
                <bdi>{s.userId === me ? `${s.name} (אתה)` : s.name}</bdi>
                {!s.seated && ' · עזב'}
              </td>
              <td className="py-1.5 text-end font-num tabular-nums" dir="ltr">
                {s.bought}
              </td>
              <td className="py-1.5 text-end font-num tabular-nums" dir="ltr">
                {s.stack}
              </td>
              <td className={`py-1.5 text-end font-num font-bold tabular-nums ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-400'}`} dir="ltr">
                {net > 0 ? `+${net}` : net}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
