import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as api from '../games/api'
import { gameKey } from '../games/hooks'

/** Game mutations. Each one refetches the game afterwards (success or failure); Realtime delivers the same change to everyone else. */
export function useGameActions(gameId: string) {
  const queryClient = useQueryClient()
  return useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: gameKey(gameId) })
    const then =
      <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      async (...args: A): Promise<void> => {
        try {
          await fn(...args)
        } finally {
          // Also after a failure (e.g. a seat was just taken: show who took it). Not awaited, so the UI
          // (dialogs, buttons) reacts as soon as the server has answered; the data follows a moment later.
          void refresh()
        }
      }
    return {
      addTransaction: then(api.addTransaction),
      voidTransaction: then(api.voidTransaction),
      addPlayer: then((name: string, role?: Parameters<typeof api.addPlayer>[2]) => api.addPlayer(gameId, name, role)),
      removePlayer: then(api.removePlayer),
      setPlayerRole: then(api.setPlayerRole),
      setPlayerSeat: then(api.setPlayerSeat),
      closeGame: then((snapshot: Record<string, unknown>, text: string) => api.closeGame(gameId, snapshot, text)),
    }
  }, [gameId, queryClient])
}
