import type { GamePlayerRow } from '../games/types'

/** Fixed table size; mirrored by the CHECK constraint in 0002_seats.sql. */
export const MAX_SEATS = 10

/** The table is drawn in a 300 x 560 coordinate system (long axis vertical, like a phone screen). */
export const TABLE_W = 300
export const TABLE_H = 560

export interface SeatAnchor {
  seat: number
  /** Seat centre in table units. */
  x: number
  y: number
}

export interface SeatPosition {
  seat: number
  /** Percentages of the table area (layout geometry, not text direction). */
  x: number
  y: number
}

const SIDE_Y = [176.5, 245.5, 314.5, 383.5] as const

/**
 * 4 seats on each long side + 1 at each end (a 10-player stadium table).
 * Numbered clockwise as seen from above: 1 = top end, 2-5 = right side top to bottom,
 * 6 = bottom end, 7-10 = left side bottom to top.
 */
export const SEAT_ANCHORS: readonly SeatAnchor[] = [
  { seat: 1, x: 150, y: 34 },
  ...SIDE_Y.map((y, i) => ({ seat: 2 + i, x: 248, y })),
  { seat: 6, x: 150, y: 526 },
  ...[...SIDE_Y].reverse().map((y, i) => ({ seat: 7 + i, x: 52, y })),
]

const round = (n: number): number => Math.round(n * 100) / 100

export function seatPositions(): SeatPosition[] {
  return SEAT_ANCHORS.map((a) => ({ seat: a.seat, x: round((a.x / TABLE_W) * 100), y: round((a.y / TABLE_H) * 100) }))
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
