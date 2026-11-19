import { useState } from 'react'
import type { GameResult, Role } from '../../lib/finance'
import { Dialog } from '../../components/Dialog'
import { Avatar, Badge, btnDanger, btnPrimary, btnSecondary, inputCls, Money } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import type { GameBundle } from '../games/types'
import { ROLE_LABEL } from './labels'

interface Props {
  bundle: GameBundle
  result: GameResult
  /** Table manager of an open game. */
  canManage: boolean
  /** General admin: may also remove a player who already has entries (they are deleted with the player). */
  isAdmin?: boolean
  onAddPlayer: (name: string, role?: Role) => Promise<void>
  onRemovePlayer: (id: string) => Promise<void>
  onAdminRemovePlayer?: (id: string) => Promise<void>
  onSetRole: (id: string, role: Role) => Promise<void>
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function SettingsPanel({
  bundle,
  result,
  canManage,
  isAdmin = false,
  onAddPlayer,
  onRemovePlayer,
  onAdminRemovePlayer,
  onSetRole,
}: Props) {
  const { run, busy, error } = useAction()
  const removing = useAction()
  const [toRemove, setToRemove] = useState<string | null>(null)
  const removeTarget = toRemove === null ? null : (bundle.players.find((p) => p.id === toRemove) ?? null)
  const removeTx = toRemove === null ? [] : bundle.transactions.filter((t) => t.player_id === toRemove && t.voided_at === null)
  const removeResult = result.players.find((p) => p.id === toRemove) ?? null
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const code = bundle.game.join_code
  const link = `${window.location.origin}/join/${code}`
  const hasHost = result.fees.hasHost

  const share = async () => {
    const text = `מצטרפים לערב הפוקר: ${link}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
        return
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    setCopied(await copyText(link))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">הצטרפות למשחק</h2>
        <p className="text-sm text-slate-400">שתפו את הקישור או את הקוד עם מי שמגיע לערב.</p>
        <div className="flex items-center gap-3">
          <bdi dir="ltr" className="font-num text-2xl font-bold tracking-widest">
            {code}
          </bdi>
          <button type="button" className={btnSecondary} onClick={() => void share()}>
            {copied ? 'הועתק ✓' : 'שיתוף קישור'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">מארח ודמי כניסה</h2>
        <p className="text-sm text-slate-400">
          {hasHost
            ? 'יש מארח: אורח משלם 10 ₪ (5 לקופה הקבוצתית + 5 למארח). כל מארח משלם רק 5 ₪ לקופה.'
            : 'אין מארח (מקום ניטרלי): כל שחקן משלם 10 ₪ וכל הסכום הולך לקופה הקבוצתית. אין דמי אירוח.'}
        </p>
        <ul className="space-y-2">
          {bundle.players.map((p) => {
            const hasLedger = bundle.transactions.some((t) => t.player_id === p.id)
            const isHost = p.role === 'host'
            const isSpouse = p.role === 'host_spouse'
            return (
              <li key={p.id} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.display_name} src={p.avatar_url} size="sm" />
                  <span className="flex-1 font-semibold">{p.display_name}</span>
                  {p.role !== 'guest' && <Badge tone="amber">{ROLE_LABEL[p.role]}</Badge>}
                  {p.user_id === null && <Badge>ללא חשבון</Badge>}
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={isHost}
                      disabled={busy}
                      className={`${btnSecondary} ${isHost ? 'border-emerald-500 text-emerald-300' : ''}`}
                      onClick={() => void run(() => onSetRole(p.id, isHost ? 'guest' : 'host'))}
                    >
                      מארח
                    </button>
                    <button
                      type="button"
                      aria-pressed={isSpouse}
                      disabled={busy || (!hasHost && !isSpouse) || isHost}
                      className={`${btnSecondary} ${isSpouse ? 'border-emerald-500 text-emerald-300' : ''}`}
                      onClick={() => void run(() => onSetRole(p.id, isSpouse ? 'guest' : 'host_spouse'))}
                    >
                      בן/בת זוג של המארח
                    </button>
                    {hasLedger && isAdmin && onAdminRemovePlayer ? (
                      <button
                        type="button"
                        disabled={busy}
                        className={`${btnSecondary} ms-auto text-rose-300`}
                        onClick={() => {
                          removing.clearError()
                          setToRemove(p.id)
                        }}
                      >
                        הסר (מנהל)
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || hasLedger}
                        title={hasLedger ? 'אי אפשר להסיר שחקן שיש לו רישומים' : undefined}
                        className={`${btnSecondary} ms-auto`}
                        onClick={() => void run(() => onRemovePlayer(p.id))}
                      >
                        הסר
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {canManage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = name.trim()
              if (trimmed === '') return
              void run(async () => {
                await onAddPlayer(trimmed)
                setName('')
              })
            }}
          >
            <input
              className={inputCls}
              placeholder="הוספת שחקן בלי חשבון (למשל בן/בת זוג)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
            <button type="submit" className={btnPrimary} disabled={busy || name.trim() === ''}>
              הוסף
            </button>
          </form>
        )}
        {!canManage && <p className="text-sm text-slate-500">רק מנהל השולחן יכול לשנות שחקנים ותפקידים.</p>}
        {error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
      </section>

      <Dialog open={removeTarget !== null} onClose={() => setToRemove(null)} title={`להסיר את ${removeTarget?.display_name ?? ''} מהשולחן?`} tone="danger">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            השחקן יוסר מהשולחן הזה בלבד, ואיתו יימחקו כל {removeTx.length} הרישומים שלו (Buy-in, Rebuy ו-Cash-out). המאזן של השולחן יתעדכן כאילו
            הוא לא שיחק. אי אפשר לשחזר.
          </p>
          {removeResult && (
            <p className="rounded-xl bg-slate-950 p-3 text-sm">
              הכניס <Money value={removeResult.invested} />
              {removeResult.cashOut !== null && (
                <>
                  {' · '}Cash-out <Money value={removeResult.cashOut} />
                </>
              )}
            </p>
          )}
          {removing.error !== null && (
            <p role="alert" className="text-sm text-rose-400">
              {removing.error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className={`${btnSecondary} flex-1`} onClick={() => setToRemove(null)}>
              ביטול
            </button>
            <button
              type="button"
              className={`${btnDanger} flex-1`}
              disabled={removing.busy}
              onClick={async () => {
                if (toRemove === null || !onAdminRemovePlayer) return
                const r = await removing.run(() => onAdminRemovePlayer(toRemove))
                if (r.ok) setToRemove(null)
              }}
            >
              {removing.busy ? 'מסיר…' : 'כן, הסר'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
