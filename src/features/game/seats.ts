import type { GamePlayerRow } from '../games/types'

/** Fixed table size; mirrored by the CHECK constraint in 0002_seats.sql. */
export const MAX_SEATS = 10

export interface SeatPosition {
  seat: number
  /** Percentages of the table area (layout geometry, not text direction). */
  x: number
  y: number
}

const round = (n: number): number => Math.round(n * 100) / 100

/** Seats spaced evenly around an ellipse, seat 1 at the top, clockwise as seen from above. */
export function seatPositions(count: number = MAX_SEATS): SeatPosition[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    return { seat: i + 1, x: round(50 + 43 * Math.cos(angle)), y: round(50 + 40 * Math.sin(angle)) }
  })
}

export function occupantsBySeat(players: readonly GamePlayerRow[]): Map<number, GamePlayerRow> {
  const map = new Map<number, GamePlayerRow>()
  for (const p of players) if (p.seat !== null) map.set(p.seat, p)
  return map
}

/** The signed-in user's own player row (absent when the manager created the game without playing). */
export const playerOfUser = (players: readonly GamePlayerRow[], userId: string | undefined): GamePlayerRow | undefined =>
  userId === undefined ? undefined : players.find((p) => p.user_id === userId)

export const unseatedPlayers = (players: readonly GamePlayerRow[]): GamePlayerRow[] =>
  players.filter((p) => p.seat === null)
