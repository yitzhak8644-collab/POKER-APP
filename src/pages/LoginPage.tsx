import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { toHebrewMessage } from '../lib/errors'

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session !== null) return <Navigate to="/" replace />

  const onClick = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(toHebrewMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">פוקר טראקר</h1>
      <p className="text-slate-400">מעקב כניסות, ריבאיים וסיכום חשבונות לערב הפוקר השבועי.</p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 disabled:opacity-60"
      >
        {busy ? 'מתחבר…' : 'התחברות עם Google'}
      </button>
      {error !== null && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
    </main>
  )
}
