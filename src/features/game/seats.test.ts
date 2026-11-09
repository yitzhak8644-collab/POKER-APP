import { describe, expect, it } from 'vitest'
import type { GamePlayerRow } from '../games/types'
import {
  CUP_HOLDERS,
  MAX_SEATS,
  occupantsBySeat,
  playerOfUser,
  R_RAIL,
  SEAT_ANCHORS,
  seatPositions,
  STRAIGHT,
  TABLE_W,
  unseatedPlayers,
  Y_BOTTOM,
  Y_TOP,
} from './seats'

const row = (id: string, seat: number | null, userId: string | null = null): GamePlayerRow => ({
  id, game_id: 'g', user_id: userId, display_name: id, avatar_url: null, role: 'guest', seat, host_asked: true, created_by: 'u', created_at: 't',
})

describe('seatPositions (stadium table: 4 + 4 on the long sides, 1 at each end)', () => {
  const positions = seatPositions()
  const at = (seat: number) => positions[seat - 1]!

  it('has ten seats numbered 1..10', () => {
    expect(positions).toHaveLength(MAX_SEATS)
    expect(positions.map((p) => p.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('seat 1 is the top end and seat 6 the bottom end, both on the centre line', () => {
    expect(at(1).x).toBe(50)
    expect(at(6).x).toBe(50)
    expect(at(1).y).toBe(Math.min(...positions.map((p) => p.y)))
    expect(at(6).y).toBe(Math.max(...positions.map((p) => p.y)))
  })

  it('goes clockwise: the right side runs top to bottom, the left side bottom to top', () => {
    const right = [2, 3, 4, 5].map(at)
    const left = [7, 8, 9, 10].map(at)
    expect(right.every((p) => p.x > 50)).toBe(true)
    expect(left.every((p) => p.x < 50)).toBe(true)
    expect(right.map((p) => p.y)).toEqual([...right.map((p) => p.y)].sort((a, b) => a - b))
    expect(left.map((p) => p.y)).toEqual([...left.map((p) => p.y)].sort((a, b) => b - a))
    // the end seats sit beyond the side seats
    expect(at(1).y).toBeLessThan(at(2).y)
    expect(at(6).y).toBeGreaterThan(at(5).y)
  })

  it('is mirror-symmetric: seat k faces seat 12 - k across the table', () => {
    for (const k of [2, 3, 4, 5]) {
      const a = at(k)
      const b = at(12 - k)
      expect(Math.abs(a.x + b.x - 100)).toBeLessThan(0.02)
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.02)
    }
  })

  it('keeps every seat inside the table area', () => {
    for (const p of positions) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(100)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(100)
    }
  })

  it('the seats next to the ends sit on the curves, two seats on each straight side', () => {
    const anchor = (seat: number) => SEAT_ANCHORS[seat - 1]!
    for (const seat of [2, 10]) expect(anchor(seat).y, `seat ${seat}`).toBeLessThan(Y_TOP)
    for (const seat of [5, 7]) expect(anchor(seat).y, `seat ${seat}`).toBeGreaterThan(Y_BOTTOM)
    for (const seat of [3, 4, 8, 9]) {
      expect(anchor(seat).y, `seat ${seat}`).toBeGreaterThanOrEqual(Y_TOP)
      expect(anchor(seat).y, `seat ${seat}`).toBeLessThanOrEqual(Y_BOTTOM)
    }
  })

  it('the table is about as long as the real one (rail length is 1.7 to 2.1 times its width)', () => {
    const ratio = (STRAIGHT + 2 * R_RAIL) / (2 * R_RAIL)
    expect(ratio).toBeGreaterThan(1.7)
    expect(ratio).toBeLessThan(2.1)
  })

  it('seats are evenly spaced round the table', () => {
    const gaps = SEAT_ANCHORS.map((a, i) => {
      const b = SEAT_ANCHORS[(i + 1) % MAX_SEATS]!
      return Math.hypot(a.x - b.x, a.y - b.y)
    })
    // straight-line gaps differ a little between curve and straight parts, but never by much
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(12)
    expect(Math.min(...gaps)).toBeGreaterThan(75)
  })

  it('every cup holder sits on the rail next to its seat', () => {
    expect(CUP_HOLDERS).toHaveLength(MAX_SEATS)
    CUP_HOLDERS.forEach((cup, i) => {
      const seat = SEAT_ANCHORS[i]!
      expect(cup.seat).toBe(seat.seat)
      expect(Math.hypot(cup.x - seat.x, cup.y - seat.y)).toBeGreaterThan(30) // between the seat and the felt
      expect(Math.hypot(cup.x - seat.x, cup.y - seat.y)).toBeLessThan(45)
    })
  })

  it('leaves room for a 58px seat button between neighbours on a 20rem-wide map', () => {
    const scale = (20 * 16) / TABLE_W // table units -> px
    for (let i = 0; i < SEAT_ANCHORS.length; i++) {
      for (let j = i + 1; j < SEAT_ANCHORS.length; j++) {
        const a = SEAT_ANCHORS[i]!
        const b = SEAT_ANCHORS[j]!
        const dx = (a.x - b.x) * scale
        const dy = (a.y - b.y) * scale
        // buttons are 64px wide and up to 58px tall (the top seat has its name above): they overlap only if both gaps are smaller than that
        expect(Math.abs(dx) >= 64 || Math.abs(dy) >= 58, `seats ${a.seat} and ${b.seat} overlap`).toBe(true)
      }
    }
  })
})

describe('seat helpers', () => {
  const players = [row('a', 3, 'u-a'), row('b', null, 'u-b'), row('c', 7), row('d', null)]

  it('occupantsBySeat maps seat -> player and skips unseated players', () => {
    const map = occupantsBySeat(players)
    expect([...map.keys()].sort()).toEqual([3, 7])
    expect(map.get(3)?.id).toBe('a')
  })

  it('playerOfUser finds the signed-in user\'s player (or nothing)', () => {
    expect(playerOfUser(players, 'u-b')?.id).toBe('b')
    expect(playerOfUser(players, 'u-nobody')).toBeUndefined()
    expect(playerOfUser(players, undefined)).toBeUndefined()
  })

  it('unseatedPlayers lists who still has no seat', () => {
    expect(unseatedPlayers(players).map((p) => p.id)).toEqual(['b', 'd'])
  })
})
