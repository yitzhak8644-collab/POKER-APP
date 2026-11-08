import { useCallback, useState } from 'react'
import { toHebrewMessage } from '../lib/errors'

/** Runs an async action with busy/error state; errors are shown in Hebrew. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    setBusy(true)
    setError(null)
    try {
      return { ok: true, value: await fn() }
    } catch (err) {
      setError(toHebrewMessage(err))
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { run, busy, error, clearError }
}
