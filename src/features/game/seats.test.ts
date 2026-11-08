import { describe, expect, it } from 'vitest'
import type { GamePlayerRow } from '../games/types'
import { MAX_SEATS, occupantsBySeat, playerOfUser, SEAT_ANCHORS, seatPositions, TABLE_W, unseatedPlayers } from './seats'

const row = (id: string, seat: number | null, userId: string | null = null): GamePlayerRow => ({
  id, game_id: 'g', user_id: userId, display_name: id, avatar_url: null, role: 'guest', seat, created_by: 'u', created_at: 't',
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

  it('leaves room for a 54px seat button between neighbours on a 17rem-wide map', () => {
    const scale = (17 * 16) / TABLE_W // table units -> px
    for (let i = 0; i < SEAT_ANCHORS.length; i++) {
      for (let j = i + 1; j < SEAT_ANCHORS.length; j++) {
        const a = SEAT_ANCHORS[i]!
        const b = SEAT_ANCHORS[j]!
        const dx = (a.x - b.x) * scale
        const dy = (a.y - b.y) * scale
        // buttons are 64px wide and ~54px tall: they overlap only if both gaps are smaller than that
        expect(Math.abs(dx) >= 64 || Math.abs(dy) >= 54, `seats ${a.seat} and ${b.seat} overlap`).toBe(true)
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
