import { describe, expect, it } from 'vitest'
import { assertInteger, assertMoney, sum } from '../money'

describe('money', () => {
  it('sum adds whole numbers and is 0 for an empty list', () => {
    expect(sum([1, 2, 3])).toBe(6)
    expect(sum([])).toBe(0)
  })

  it('assertInteger accepts integers (including negatives and 0)', () => {
    expect(() => assertInteger(0, 'x')).not.toThrow()
    expect(() => assertInteger(-5, 'x')).not.toThrow()
    expect(() => assertInteger(120, 'x')).not.toThrow()
  })

  it('assertInteger rejects floats, NaN and Infinity', () => {
    expect(() => assertInteger(10.5, 'amount')).toThrow(/amount must be a whole number/)
    expect(() => assertInteger(Number.NaN, 'x')).toThrow(RangeError)
    expect(() => assertInteger(Number.POSITIVE_INFINITY, 'x')).toThrow(RangeError)
  })

  it('assertMoney accepts 0 and positive integers, rejects negatives and floats', () => {
    expect(() => assertMoney(0, 'x')).not.toThrow()
    expect(() => assertMoney(50, 'x')).not.toThrow()
    expect(() => assertMoney(-1, 'x')).toThrow(/must not be negative/)
    expect(() => assertMoney(0.1, 'x')).toThrow(RangeError)
  })
})
