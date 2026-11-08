import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import { fetchGameBundle, fetchMyGames } from './api'
import { applyBundleChange, needsRefetch, type RealtimeTable } from './realtime'
import type { GameBundle } from './types'

export const gameKey = (gameId: string) => ['game', gameId] as const
export const MY_GAMES_KEY = ['games'] as const

export const useMyGames = () => useQuery({ queryKey: MY_GAMES_KEY, queryFn: fetchMyGames })

export const useGameBundle = (gameId: string) =>
  useQuery({ queryKey: gameKey(gameId), queryFn: () => fetchGameBundle(gameId) })

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>

const LATE_REFETCH_MS = 4000

/**
 * Keeps the cached game in sync through one Realtime channel.
 * - INSERT/UPDATE are filtered by game_id and RLS applies, so only members receive them.
 * - Postgres Changes cannot filter DELETE (and RLS is not applied; `old` carries only the PK),
 *   so game_players deletes arrive unfiltered and are applied only if the id is in the cache.
 * - Every (re)subscribe and every return to the foreground refetches, closing any gap.
 * - Realtime's database subscription is registered a moment after SUBSCRIBED (and on a cold project it
 *   can take a few seconds), so we also refetch when the server confirms it ("system" message) and once
 *   more shortly after: a change committed in that window is never missed.
 */
export function useGameRealtime(gameId: string): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = getSupabase()
    const key = gameKey(gameId)
    const refetch = () => void queryClient.invalidateQueries({ queryKey: key })

    const handle = (table: RealtimeTable) => (payload: Payload) => {
      const newRow = payload.eventType === 'DELETE' ? null : (payload.new as Record<string, unknown>)
      const oldRow = payload.eventType === 'INSERT' ? null : (payload.old as Record<string, unknown>)
      queryClient.setQueryData<GameBundle>(key, (bundle) =>
        bundle ? applyBundleChange(bundle, table, payload.eventType, newRow, oldRow) : bundle,
      )
      if (needsRefetch(table, newRow)) refetch()
    }

    let lateRefetch: ReturnType<typeof setTimeout> | undefined
    const byGame = `game_id=eq.${gameId}`
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, handle('games'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_players', filter: byGame }, handle('game_players'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_players', filter: byGame }, handle('game_players'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_players' }, handle('game_players'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: byGame }, handle('transactions'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: byGame }, handle('transactions'))
      .on('system', {}, (payload: { extension?: string; status?: string }) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') refetch()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          refetch()
          lateRefetch = setTimeout(refetch, LATE_REFETCH_MS)
        }
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(lateRefetch)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [gameId, queryClient])
}
