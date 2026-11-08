import { describe, expect, it } from 'vitest'
import { formatDateTime, formatGameDate, formatMoney, todayInIsrael } from './format'

describe('format', () => {
  it('formatMoney', () => {
    expect(formatMoney(50)).toBe('50\u00A0₪')
    expect(formatMoney(50, { signed: true })).toBe('+50\u00A0₪')
    expect(formatMoney(-50, { signed: true })).toBe('-50\u00A0₪')
    expect(formatMoney(0, { signed: true })).toBe('0\u00A0₪')
  })

  it('formatGameDate flips ISO to DD/MM/YYYY', () => {
    expect(formatGameDate('2026-11-05')).toBe('05/11/2026')
  })

  it('formatDateTime uses Israel time (UTC+2 in winter, UTC+3 in summer)', () => {
    expect(formatDateTime('2026-11-05T19:30:00Z')).toBe('05/11 21:30')
    expect(formatDateTime('2026-07-01T21:30:00Z')).toBe('02/07 00:30')
  })

  it('todayInIsrael rolls over at Israel midnight', () => {
    expect(todayInIsrael(new Date('2026-11-05T21:59:00Z'))).toBe('2026-11-05')
    expect(todayInIsrael(new Date('2026-11-05T22:01:00Z'))).toBe('2026-11-06')
  })
})
