import { useParams } from 'react-router-dom'
import { useGameBundle, useGameRealtime } from '../features/games/hooks'
import { deriveGame } from '../features/games/mapping'
import { toHebrewMessage } from '../lib/errors'

// Placeholder: the real tabs (table / log / settings / settlement) arrive in step 5-6.
export function GamePage() {
  const { id = '' } = useParams()
  useGameRealtime(id)
  const { data, error, isLoading } = useGameBundle(id)

  if (isLoading) return <p className="p-6 text-center text-slate-400">טוען…</p>
  if (error || !data) return <p className="p-6 text-center text-rose-400">{toHebrewMessage(error)}</p>

  const game = deriveGame(data)
  return (
    <main className="mx-auto max-w-md space-y-2 p-6">
      <p>
        {data.players.length} שחקנים · קופה {game.pot} ₪ · סטטוס: {game.check.status}
      </p>
    </main>
  )
}
