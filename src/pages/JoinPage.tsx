import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { joinGame } from '../features/games/api'
import { toHebrewMessage } from '../lib/errors'

/** /join/CODE: seats the signed-in user and opens the game. */
export function JoinPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    joinGame(code).then(
      (gameId) => {
        if (active) navigate(`/g/${gameId}`, { replace: true })
      },
      (err) => {
        if (active) setError(toHebrewMessage(err))
      },
    )
    return () => {
      active = false
    }
  }, [code, navigate])

  if (error !== null) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-center">
        <p role="alert" className="text-rose-400">
          {error}
        </p>
        <Link to="/" className="text-slate-300 underline">
          לדף הבית
        </Link>
      </main>
    )
  }
  return <p className="p-6 text-center text-slate-400">מצטרף למשחק…</p>
}
