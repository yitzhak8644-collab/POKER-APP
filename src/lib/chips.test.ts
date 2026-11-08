import { describe, expect, it } from 'vitest'
import { CHIPS, REBUY_AMOUNT, REBUY_STACK, chipPhrase, formatChipNote, stackFor, stackValue } from './chips'

const byId = Object.fromEntries(CHIPS.map((c) => [c.id, c]))

describe('chips', () => {
  it('has the table\'s values: red 5, green 10, blue 25, black 100, yellow 250', () => {
    expect(CHIPS.map((c) => [c.id, c.value])).toEqual([
      ['red', 5], ['green', 10], ['blue', 25], ['black', 100], ['yellow', 250],
    ])
    expect(CHIPS.map((c) => c.label)).toEqual(['אדום', 'ירוק', 'כחול', 'שחור', 'צהוב'])
  })

  it('a rebuy is 250 and is 10 red + 10 green + 4 blue, with no black or yellow', () => {
    expect(REBUY_AMOUNT).toBe(250)
    expect(REBUY_STACK).toEqual({ red: 10, green: 10, blue: 4 })
    expect(stackValue(REBUY_STACK)).toBe(250)
    expect(REBUY_STACK.black).toBeUndefined()
    expect(REBUY_STACK.yellow).toBeUndefined()
  })
})

describe('stackValue', () => {
  it('adds up chips by value, missing colours count as 0', () => {
    expect(stackValue({})).toBe(0)
    expect(stackValue({ red: 3 })).toBe(15)
    expect(stackValue({ red: 1, green: 1, blue: 1, black: 1, yellow: 1 })).toBe(390)
    expect(stackValue({ black: 2, yellow: 1, blue: 3 })).toBe(525)
  })

  it('rejects fractions and negatives', () => {
    expect(() => stackValue({ red: 1.5 })).toThrow(RangeError)
    expect(() => stackValue({ blue: -1 })).toThrow(/blue count/)
    expect(() => stackValue({ black: Number.NaN })).toThrow(RangeError)
  })
})

describe('stackFor', () => {
  it('gives the standard stack for 250 and whole multiples of it', () => {
    expect(stackFor(250)).toEqual({ red: 10, green: 10, blue: 4 })
    expect(stackFor(500)).toEqual({ red: 20, green: 20, blue: 8 })
    expect(stackValue(stackFor(750)!)).toBe(750)
  })

  it('has no standard stack for other amounts', () => {
    for (const amount of [0, -250, 100, 251, 125.5, Number.NaN]) expect(stackFor(amount)).toBeNull()
  })
})

describe('text', () => {
  it('chipPhrase uses singular for one and plural otherwise', () => {
    expect(chipPhrase(byId.red!, 1)).toBe('1 אדום')
    expect(chipPhrase(byId.red!, 10)).toBe('10 אדומים')
    expect(chipPhrase(byId.blue!, 4)).toBe('4 כחולים')
  })

  it('formatChipNote lists only counted colours, in chip order', () => {
    expect(formatChipNote({ blue: 2, red: 10, black: 0 })).toBe('אדום×10, כחול×2')
    expect(formatChipNote({})).toBe('')
    expect(formatChipNote({ yellow: 1, green: 8 })).toBe('ירוק×8, צהוב×1')
  })
})
