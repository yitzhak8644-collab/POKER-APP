import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as api from '../games/api'
import { gameKey } from '../games/hooks'

/** Game mutations. Each one refetches the game afterwards; Realtime delivers the same change to everyone else. */
export function useGameActions(gameId: string) {
  const queryClient = useQueryClient()
  return useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: gameKey(gameId) })
    const then =
      <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      async (...args: A): Promise<void> => {
        await fn(...args)
        await refresh()
      }
    return {
      addTransaction: then(api.addTransaction),
      voidTransaction: then(api.voidTransaction),
      addPlayer: then((name: string, role?: Parameters<typeof api.addPlayer>[2]) => api.addPlayer(gameId, name, role)),
      removePlayer: then(api.removePlayer),
      setPlayerRole: then(api.setPlayerRole),
      closeGame: then((snapshot: Record<string, unknown>, text: string) => api.closeGame(gameId, snapshot, text)),
    }
  }, [gameId, queryClient])
}
