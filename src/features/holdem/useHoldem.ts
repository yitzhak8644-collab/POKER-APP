import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action } from '../../lib/holdem/engine'
import { toHebrewMessage } from '../../lib/errors'
import type { HoldemBackend, TableSnapshot } from './backend'

/**
 * Live view of one table plus the "clock": whoever is looking at the table nudges the server when a
 * turn timer or the pause between hands runs out (the server checks the time itself).
 */
export function useHoldem(backend: HoldemBackend | null) {
  const [snap, setSnap] = useState<TableSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef<TableSnapshot | null>(null)

  useEffect(() => {
    latest.current = null
    setSnap(null)
    if (!backend) return
    return backend.subscribe((s) => {
      latest.current = s
      setSnap(s)
    })
  }, [backend])

  useEffect(() => {
    if (!backend) return
    // Not everyone at once: the player whose turn it is goes first, the others a moment later.
    const jitter = backend.practice ? 0 : 300 + Math.random() * 700
    let lastTick = 0
    const id = setInterval(() => {
      const pub = latest.current?.pub
      if (!pub || pub.closed) return
      const h = pub.hand
      const due = pub.phase === 'hand' ? (h?.deadline ?? null) : pub.phase === 'between' ? pub.nextAt : null
      if (due === null) return
      const mine = pub.phase === 'hand' && h !== null && h.toAct !== null && pub.seats[h.toAct]?.userId === backend.me
      if (Date.now() + backend.offset() < due + (mine ? 120 : jitter)) return
      if (Date.now() - lastTick < 2000) return
      lastTick = Date.now()
      backend.send({ type: 'tick' }).catch(() => undefined)
    }, 250)
    return () => clearInterval(id)
  }, [backend])

  const act = useCallback(
    async (action: Action): Promise<boolean> => {
      if (!backend) return false
      setBusy(true)
      setError(null)
      try {
        await backend.send(action)
        return true
      } catch (err) {
        setError(toHebrewMessage(err))
        return false
      } finally {
        setBusy(false)
      }
    },
    [backend],
  )

  const clearError = useCallback(() => setError(null), [])
  return { snap, act, busy, error, clearError }
}
