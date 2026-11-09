import { useEffect, useState } from 'react'
import { btnPrimary, btnSecondary } from '../../components/ui'
import { enablePush, pushPermission, subscribeToPush } from './push'

const DISMISSED_KEY = 'poker.push.dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Asks (once, after sign-in) for permission to send "a table just opened" notifications.
 * If permission was already granted, it quietly re-registers this device.
 */
export function NotificationPrompt() {
  const [permission, setPermission] = useState(pushPermission())
  const [dismissed, setDismissed] = useState(wasDismissed())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (permission === 'granted') void subscribeToPush().catch(() => undefined)
  }, [permission])

  if (permission !== 'default' || dismissed) return null

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-700 bg-emerald-950/40 p-4">
      <h2 className="font-bold text-emerald-300">לקבל הודעה כשנפתח שולחן?</h2>
      <p className="text-sm text-slate-300">נשלח התראה לטלפון ברגע שמישהו פותח שולחן, כדי שלא תפספסו.</p>
      {error !== null && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`${btnPrimary} flex-1`}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              setPermission(await enablePush())
            } catch {
              setError('לא הצלחנו להפעיל התראות. נסו שוב.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'מפעיל…' : 'כן, אשמח'}
        </button>
        <button
          type="button"
          className={`${btnSecondary} flex-1`}
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, '1')
            } catch {
              /* private mode: just hide for this visit */
            }
            setDismissed(true)
          }}
        >
          לא עכשיו
        </button>
      </div>
    </section>
  )
}
