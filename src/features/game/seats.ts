import type { GamePlayerRow } from '../games/types'

/** Fixed table size; mirrored by the CHECK constraint in 0002_seats.sql. */
export const MAX_SEATS = 10

/** The table is drawn in a 300 x 416 coordinate system (long axis vertical, like a phone screen). */
export const TABLE_W = 300
export const TABLE_H = 416

/** Stadium geometry (table units). The long sides are straight, the two ends are semicircles. */
export const CX = 150 // centre line
export const R_RAIL = 72 // outer radius of the padded rail (half its width)
export const R_CUP = 62 // cup holders sit in the middle of the rail
export const R_SEAT = 100 // seat centres, just outside the rail
export const Y_TOP = 140 // centre of the top semicircle
export const STRAIGHT = 128 // length of the straight part of the long sides
export const Y_BOTTOM = Y_TOP + STRAIGHT

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

const ARC = Math.PI * R_SEAT // length of one semicircular end on the seat contour
const PERIMETER = 2 * STRAIGHT + 2 * ARC
const round = (n: number): number => Math.round(n * 100) / 100

/**
 * A point on the stadium contour, `u` units clockwise from the top centre, at the given radius.
 * The same `u` at another radius gives the matching point on the rail (used for the cup holders).
 */
export function pointOnContour(u: number, radius: number): { x: number; y: number } {
  let d = u
  if (d < ARC / 2) {
    const phi = d / R_SEAT // top end, right half: from the top centre round to the right side
    return { x: CX + radius * Math.sin(phi), y: Y_TOP - radius * Math.cos(phi) }
  }
  d -= ARC / 2
  if (d < STRAIGHT) return { x: CX + radius, y: Y_TOP + d } // right side, going down
  d -= STRAIGHT
  if (d < ARC) {
    const psi = d / R_SEAT // bottom end: from the right side round to the left side
    return { x: CX + radius * Math.cos(psi), y: Y_BOTTOM + radius * Math.sin(psi) }
  }
  d -= ARC
  if (d < STRAIGHT) return { x: CX - radius, y: Y_BOTTOM - d } // left side, going up
  d -= STRAIGHT
  const phi = d / R_SEAT // top end, left half: from the left side up to the top centre
  return { x: CX - radius * Math.cos(phi), y: Y_TOP - radius * Math.sin(phi) }
}

/** Seat k sits k-1 tenths of the way round the table: the ends at the middle of the curves,
 * the seats next to them on the curves, and two seats on each straight side. */
const seatU = (seat: number): number => ((seat - 1) * PERIMETER) / MAX_SEATS

/**
 * 4 seats on each long side + 1 at each end (a 10-player stadium table), evenly spaced around it.
 * Numbered clockwise as seen from above: 1 = top end, 2-5 = right side top to bottom,
 * 6 = bottom end, 7-10 = left side bottom to top.
 */
export const SEAT_ANCHORS: readonly SeatAnchor[] = Array.from({ length: MAX_SEATS }, (_, i) => {
  const { x, y } = pointOnContour(seatU(i + 1), R_SEAT)
  return { seat: i + 1, x: round(x), y: round(y) }
})

/** The cup holder next to each seat, on the padded rail. */
export const CUP_HOLDERS: readonly SeatAnchor[] = Array.from({ length: MAX_SEATS }, (_, i) => {
  const { x, y } = pointOnContour(seatU(i + 1), R_CUP)
  return { seat: i + 1, x: round(x), y: round(y) }
})

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
