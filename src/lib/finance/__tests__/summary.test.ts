import { describe, expect, it } from 'vitest'
import { buildWhatsAppSummary, formatDate } from '../summary'
import type { SettledPlayer, Transfer } from '../types'

const R = '‏'
const L = '‎'
const DATE = new Date('2026-11-05T19:30:00Z')

/** Settled player with obligation = net - 10 + hostPayout. */
const sp = (id: string, net: number, hostPayout = 0): SettledPlayer => ({
  id,
  name: id,
  role: hostPayout > 0 ? 'host' : 'guest',
  invested: 100,
  cashOut: 100 + net,
  net,
  entryFee: 10,
  hostPayout,
  obligation: net - 10 + hostPayout,
})

const build = (players: SettledPlayer[], transfers: Transfer[] = [], groupFund = 10, pot = 100) =>
  buildWhatsAppSummary({ date: DATE, pot, groupFund, players, transfers })

describe('formatDate', () => {
  it('formats DD/MM/YYYY in Israel time', () => {
    expect(formatDate(new Date('2026-11-05T19:30:00Z'))).toBe('05/11/2026') // IST, UTC+2
  })

  it('rolls over to the next day at Israel midnight', () => {
    expect(formatDate(new Date('2026-11-05T22:30:00Z'))).toBe('06/11/2026')
    expect(formatDate(new Date('2026-07-01T21:30:00Z'))).toBe('02/07/2026') // IDT, UTC+3
  })
})

describe('buildWhatsAppSummary', () => {
  it('header has the title and the date', () => {
    const text = build([sp('a', -10)])
    expect(text.split('\n')[0]).toBe(`${R}🃏 *סיכום ערב פוקר* · 05/11/2026`)
  })

  it('lists plus then minus, each player as "name amount" with the FINAL obligation', () => {
    const text = build([sp('h', 40, 15), sp('a', -50), sp('e', 10)])
    expect(text).toBe(
      [
        `${R}🃏 *סיכום ערב פוקר* · 05/11/2026`,
        '',
        `${R}*פלוס:*`,
        `${R}h${R} ${L}+45\u00A0₪${L}`,
        '',
        `${R}*מינוס:*`,
        `${R}a${R} ${L}-60\u00A0₪${L}`,
        '',
        `${R}*מאוזן:*`,
        `${R}e${R} ${L}0\u00A0₪${L}`,
      ].join('\n'),
    )
  })

  it('has no transfers, pot, fund, or per-player breakdown', () => {
    const text = build(
      [sp('a', -50), sp('b', 40, 15)],
      [{ from: 'a', to: 'b', amount: 30 }],
    )
    for (const word of ['העברות', 'משלם', 'קופה', 'פוקר +', 'כניסה', 'אירוח']) expect(text).not.toContain(word)
  })

  it('a host who ends in the minus is listed in the minus section', () => {
    const text = build([sp('h', -30, 15)])
    expect(text).toContain('מינוס:')
    expect(text).not.toContain('פלוס:')
    expect(text).toContain(`${R}h${R} ${L}-25\u00A0₪${L}`)
  })

  it('classifies by the FINAL net amount: +10 poker minus the fee is balanced, listed with 0', () => {
    const text = build([sp('b', 10), sp('a', 30)])
    expect(text).toContain('פלוס:')
    expect(text).not.toContain('מינוס:')
    expect(text).toContain(`${R}*מאוזן:*\n${R}b${R} ${L}0\u00A0₪${L}`)
  })

  it('omits empty sections', () => {
    const text = build([sp('a', 30)])
    expect(text).toContain('פלוס:')
    expect(text).not.toContain('מינוס:')
  })

  it('orders losers most-negative first and winners most-positive first, ties by id', () => {
    const text = build([
      sp('x', -10), // -20
      sp('z', -40), // -50
      sp('b', -20), // -30
      sp('a', -20), // -30 (tie with b)
      sp('p', 10), // 0 -> balanced, not listed
      sp('q', 60), // +50
      sp('r', 30), // +20
    ])
    const order = [...text.matchAll(/‏(\w)‏ /g)].map((m) => m[1])
    expect(order).toEqual(['q', 'r', 'z', 'a', 'b', 'x', 'p'])
  })
})
