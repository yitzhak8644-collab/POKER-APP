import type { Player, Role } from '../types'

export const player = (
  id: string,
  role: Role,
  invested: number,
  cashOut: number | null,
): Player => ({ id, name: id, role, invested, cashOut })

export const guest = (id: string, invested: number, cashOut: number | null): Player =>
  player(id, 'guest', invested, cashOut)

/** Golden example #1: host H, spouse S, guests A, B, C. Nets: H+40 S-20 A-50 B+10 C+20. */
export const goldenWithHost = (): Player[] => [
  player('H', 'host', 100, 140),
  player('S', 'host_spouse', 100, 80),
  guest('A', 100, 50),
  guest('B', 100, 110),
  guest('C', 100, 120),
]

/** Golden example #2: neutral venue, no host. Nets: A+30 B-10 C-20 D0. */
export const goldenNeutral = (): Player[] => [
  guest('A', 100, 130),
  guest('B', 100, 90),
  guest('C', 100, 80),
  guest('D', 100, 100),
]

/** Deterministic PRNG so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
