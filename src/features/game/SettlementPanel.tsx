import { useState } from 'react'
import { PAYBOX_ID, PAYBOX_LABEL, type GameResult } from '../../lib/finance'
import { CHIPS_PER_NIS, chipsToNis } from '../../lib/chips'
import { Dialog } from '../../components/Dialog'
import { PayBoxLink } from '../../components/PayBoxLink'
import { Avatar, btnDanger, btnPrimary, btnSecondary, inputCls, Money } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { ChipCounterDialog } from './ChipCounter'
import type { GameBundle, TransactionRow } from '../games/types'

interface Props {
  bundle: GameBundle
  result: GameResult
  /** Table manager (game owner). */
  isOwner: boolean
  isAdmin?: boolean
  /** `note` lists the chips when the amount was counted with the chip counter. */
  onCashOut: (playerId: string, amount: number, note?: string) => Promise<void>
  onVoid: (txId: string) => Promise<void>
  /** Closes the game for good (server-enforced: owner only, zero-sum, everyone cashed out). */
  onCloseGame: (force: boolean) => Promise<void>
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function SettlementPanel({ bundle, result, isOwner, isAdmin = false, onCashOut, onVoid, onCloseGame }: Props) {
  const isOpen = bundle.game.status === 'open'
  const [confirming, setConfirming] = useState(false)
  const [forcing, setForcing] = useState(false)
  const [copied, setCopied] = useState(false)
  const closing = useAction()
  const voiding = useAction()

  const activeCashOut = (playerId: string): TransactionRow | undefined =>
    bundle.transactions.find((t) => t.player_id === playerId && t.type === 'cash_out' && t.voided_at === null)
  const names = new Map<string, string>(result.players.map((p) => [p.id, p.name]))
  names.set(PAYBOX_ID, PAYBOX_LABEL)

  const text = bundle.settlement?.whatsapp_text ?? result.summary
  const copy = async () => {
    if (text === null) return
    setCopied(await copyText(text))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {!isOpen && (
        <div className="rounded-xl border border-slate-600 bg-slate-900 p-3 text-sm text-slate-300">
          🔒 המשחק נסגר. הנתונים נעולים ואי אפשר לשנות אותם.
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">Cash-out</h2>
        <ul className="space-y-2">
          {result.players.map((p) => {
            const entered = activeCashOut(p.id)
            return (
              <li key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} src={bundle.players.find((s) => s.id === p.id)?.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      הכניס <Money value={p.invested} />
                    </div>
                  </div>
                  {p.cashOut !== null ? (
                    <div className="text-end">
                      <div className="font-semibold">
                        <Money value={p.cashOut} />
                      </div>
                      <div className={`text-xs ${(p.net ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        פוקר <Money value={p.net ?? 0} signed />
                      </div>
                    </div>
                  ) : (
                    isOpen && <CashOutForm playerName={p.name} onSave={(amount, note) => onCashOut(p.id, amount, note)} />
                  )}
                  {p.cashOut !== null && isOpen && isOwner && entered && (
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={voiding.busy}
                      onClick={() => void voiding.run(() => onVoid(entered.id))}
                    >
                      בטל
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {voiding.error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {voiding.error}
          </p>
        )}
      </section>

      {result.players.every((p) => p.obligation !== null) && result.players.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">חשבון לכל שחקן</h2>
          <p className="text-xs text-slate-400">פוקר − דמי כניסה (10 ₪, מארח 5 ₪){result.fees.hasHost ? ' + דמי אירוח למארח' : ''}</p>
          <ul className="space-y-2">
            {result.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm">
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="text-slate-400">
                  <Money value={p.net ?? 0} signed /> · <Money value={-p.entryFee} signed />
                  {p.hostPayout > 0 && (
                    <>
                      {' · '}
                      <Money value={p.hostPayout} signed />
                    </>
                  )}
                </span>
                <span className={`font-bold ${(p.obligation ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  = <Money value={p.obligation ?? 0} signed />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.ready ? (
        <>
          <section className="space-y-2">
            <h2 className="font-bold">העברות (Bit / PayBox)</h2>
            <ul className="space-y-2">
              {result.transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                  <span className="font-semibold">{names.get(t.from)}</span> משלם ל-
                  <span className="font-semibold">{names.get(t.to)}</span> <Money value={t.amount} className="font-bold" />
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-400">
              קופה קבוצתית שנאספה: <Money value={result.fees.groupFund} />
            </p>
            <p className="text-sm text-slate-300">מסדרים את התשלומים בקבוצת ה-PayBox:</p>
            <PayBoxLink />
          </section>

          <section className="space-y-2">
            <h2 className="font-bold">הודעה לוואטסאפ</h2>
            <pre dir="rtl" className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm leading-relaxed">
              {text}
            </pre>
            <div className="flex gap-2">
              <button type="button" className={`${btnSecondary} flex-1`} onClick={() => void copy()}>
                {copied ? 'הועתק ✓' : 'העתקה'}
              </button>
              <a
                className={`${btnPrimary} flex-1 text-center`}
                href={`https://wa.me/?text=${encodeURIComponent(text ?? '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                שליחה בוואטסאפ
              </a>
            </div>
          </section>
        </>
      ) : (
        isOpen && <p className="text-sm text-slate-400">ההעברות וההודעה יופיעו אחרי שלכל השחקנים יוזן Cash-out והמאזן יתאפס.</p>
      )}

      {isOpen && (
        <section className="space-y-2 border-t border-slate-800 pt-4">
          {isOwner ? (
            <>
              <button
                type="button"
                className={`${btnDanger} w-full`}
                disabled={!result.ready}
                onClick={() => {
                  closing.clearError()
                  setConfirming(true)
                }}
              >
                סגירת משחק
              </button>
              {!result.ready && isAdmin && (
                <button
                  type="button"
                  className={`${btnDanger} w-full`}
                  onClick={() => {
                    closing.clearError()
                    setForcing(true)
                    setConfirming(true)
                  }}
                >
                  סגירה בכוח (מנהל כללי)
                </button>
              )}
              {!result.ready && (
                <p className="text-sm text-slate-400">
                  אפשר לסגור רק כשהמאזן מתאפס ואין שגיאות בהגדרות.
                  {isAdmin ? ' כמנהל כללי אפשר לסגור גם בלי איזון.' : ''}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">רק מנהל השולחן יכול לסגור את המשחק.</p>
          )}
        </section>
      )}

      <Dialog open={confirming} onClose={() => { setConfirming(false); setForcing(false) }} title={forcing ? 'לסגור בכוח, בלי איזון?' : 'לסגור את המשחק?'} tone="danger">
        <p className="text-sm text-slate-300">
          לאחר הסגירה אי אפשר לשנות כניסות, Cash-out או תפקידים. סיכום המשחק יישמר: קופה{' '}
          <Money value={result.pot} />, קופה קבוצתית <Money value={result.fees.groupFund} />, {result.transfers.length} העברות.
        </p>
        {closing.error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {closing.error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} flex-1`} onClick={() => { setConfirming(false); setForcing(false) }}>
            ביטול
          </button>
          <button
            type="button"
            className={`${btnDanger} flex-1`}
            disabled={closing.busy}
            onClick={async () => {
              const r = await closing.run(() => onCloseGame(forcing))
              if (r.ok) {
                setConfirming(false)
                setForcing(false)
              }
            }}
          >
            {closing.busy ? 'סוגר…' : 'כן, סגור את המשחק'}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function CashOutForm({ playerName, onSave }: { playerName: string; onSave: (amount: number, note?: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [counting, setCounting] = useState(false)
  const { run, busy, error } = useAction()
  // The box takes CHIPS (what the player counted); the ledger stores whole NIS (10 chips = 1 NIS).
  const chips = Number(text)
  const valid = text !== '' && Number.isInteger(chips) && chips >= 0
  const nis = valid ? chipsToNis(chips) : 0
  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void run(() => onSave(nis, `${chips} צ׳יפים`)).then((r) => r.ok && setText(''))
        }}
      >
        <input
          aria-label="כמות צ׳יפים ל-Cash-out"
          inputMode="numeric"
          dir="ltr"
          placeholder="צ׳יפים"
          className={`${inputCls} font-num w-24`}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className={btnPrimary} disabled={!valid || busy}>
          שמור
        </button>
        <button type="button" className={btnSecondary} disabled={busy} onClick={() => setCounting(true)} aria-label={`ספירת צ׳יפים ל${playerName}`}>
          ספירה
        </button>
      </form>
      {valid && (
        <p className="text-xs text-slate-400">
          <bdi dir="ltr" className="font-num">
            {chips}
          </bdi>{' '}
          צ׳יפים = <Money value={nis} />
          {chips % CHIPS_PER_NIS !== 0 ? ' (מעוגל לשקל)' : ''}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
      <ChipCounterDialog
        open={counting}
        playerName={playerName}
        onClose={() => setCounting(false)}
        onSave={(total, note) => {
          setCounting(false)
          void run(() => onSave(total, note === '' ? undefined : note))
        }}
      />
    </div>
  )
}
