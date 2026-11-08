import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TableArt } from './TableArt'
import { COMMUNITY_SLOTS, SLOT_H } from './tableCards'

const html = renderToStaticMarkup(<TableArt />)
const count = (needle: string) => html.split(needle).length - 1

describe('TableArt (the printed table)', () => {
  it('has four aces at each end: eight cards, two of every suit', () => {
    expect(count('data-ace=')).toBe(8)
    for (const suit of ['spade', 'heart', 'diamond', 'club']) expect(count(`data-ace="${suit}"`), suit).toBe(2)
  })

  it('has five community-card slots: three for the flop, then turn and river', () => {
    expect(count('data-slot="flop"')).toBe(3)
    expect(count('data-slot="turn"')).toBe(1)
    expect(count('data-slot="river"')).toBe(1)
  })

  it('stacks the slots flop, turn, river along the table with the flop cards side by side', () => {
    const dy = (card: string) => COMMUNITY_SLOTS.filter((s) => s.card === card).map((s) => s.dy)
    const [f1, f2, f3] = dy('flop') as [number, number, number]
    const [turn] = dy('turn') as [number]
    const [river] = dy('river') as [number]
    expect(f1).toBeLessThan(f2)
    expect(f2).toBeLessThan(f3)
    expect(f3).toBeLessThan(turn)
    expect(turn).toBeLessThan(river)
    // the flop is a tight group; there is a visible gap before the turn
    expect(f2 - f1).toBe(f3 - f2)
    expect(turn - f3).toBeGreaterThan(f2 - f1)
    // slots never overlap
    expect(f2 - f1).toBeGreaterThan(SLOT_H)
    expect(river - turn).toBeGreaterThan(SLOT_H)
  })

  it('has a steel cup holder at each of the ten seats', () => {
    expect(count('data-cup=')).toBe(10)
  })

  it('draws suits as shapes, not as font glyphs', () => {
    for (const glyph of ['♠', '♥', '♦', '♣']) expect(html.includes(glyph), glyph).toBe(false)
  })
})
