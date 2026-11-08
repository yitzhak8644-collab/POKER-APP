import { describe, expect, it } from 'vitest'
import type { GamePlayerRow } from '../games/types'
import { MAX_SEATS, occupantsBySeat, playerOfUser, seatPositions, unseatedPlayers } from './seats'

const row = (id: string, seat: number | null, userId: string | null = null): GamePlayerRow => ({
  id, game_id: 'g', user_id: userId, display_name: id, avatar_url: null, role: 'guest', seat, created_by: 'u', created_at: 't',
})

describe('seatPositions', () => {
  const positions = seatPositions()

  it('has one position per seat, numbered 1..10', () => {
    expect(positions).toHaveLength(MAX_SEATS)
    expect(positions.map((p) => p.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('seat 1 is at the top centre and the layout is mirror-symmetric', () => {
    const first = positions[0]!
    expect(first.x).toBe(50)
    expect(first.y).toBe(Math.min(...positions.map((p) => p.y)))
    for (let i = 1; i < MAX_SEATS; i++) {
      const a = positions[i]!
      const b = positions[MAX_SEATS - i]!
      expect(Math.abs(a.x + b.x - 100)).toBeLessThan(0.02)
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.02)
    }
  })

  it('goes clockwise: the next seat is to the right of the top seat', () => {
    expect(positions[1]!.x).toBeGreaterThan(50)
  })

  it('keeps every seat inside the table area and no two seats overlap', () => {
    for (const p of positions) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(100)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(100)
    }
    const keys = new Set(positions.map((p) => `${p.x},${p.y}`))
    expect(keys.size).toBe(MAX_SEATS)
  })

  it('supports other table sizes', () => {
    expect(seatPositions(6)).toHaveLength(6)
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
