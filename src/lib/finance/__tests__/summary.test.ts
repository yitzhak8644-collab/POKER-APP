import { describe, expect, it } from 'vitest'
import { PAYBOX_ID } from '../config'
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
  it('header has the date and the total pot, and the fund line is always present', () => {
    const text = build([sp('a', -10)], [], 10, 300)
    const lines = text.split('\n')
    expect(lines[0]).toBe(`${R}🃏 *סיכום ערב פוקר*`)
    expect(lines[1]).toBe(`${R}📅 05/11/2026 | 💰 קופת המשחק: ${L}300 ₪${L}`)
    expect(text).toContain(`${R}🏦 *קופה קבוצתית שנאספה*: ${L}10 ₪${L}`)
  })

  it('losers: shows poker balance and the 10 NIS entry fee', () => {
    const text = build([sp('a', -50)])
    expect(text).toContain(`${R}🔴 *שחקנים במינוס*`)
    expect(text).toContain(
      `${R}• a${R}: פוקר ${L}-50 ₪${L}, כניסה ${L}-10 ₪${L} = *${L}-60 ₪${L}*`,
    )
  })

  it('winners: shows poker win, -10 entry fee, and the host payout for the host', () => {
    const text = build([sp('h', 40, 15)])
    expect(text).toContain(`${R}🟢 *שחקנים בפלוס*`)
    expect(text).toContain(
      `${R}• h${R}: פוקר ${L}+40 ₪${L}, כניסה ${L}-10 ₪${L}, אירוח ${L}+15 ₪${L} = *${L}+45 ₪${L}*`,
    )
  })

  it('a host who ends in the minus still shows the hosting payout in the minus section', () => {
    const text = build([sp('h', -30, 15)])
    expect(text).toContain('שחקנים במינוס')
    expect(text).not.toContain('שחקנים בפלוס')
    expect(text).toContain(
      `${R}• h${R}: פוקר ${L}-30 ₪${L}, כניסה ${L}-10 ₪${L}, אירוח ${L}+15 ₪${L} = *${L}-25 ₪${L}*`,
    )
  })

  it('no hosting line when nobody got a payout (neutral venue / host without guests)', () => {
    expect(build([sp('a', 30), sp('h', 0)])).not.toContain('אירוח')
  })

  it('classifies by the FINAL obligation: +10 poker minus the fee is balanced', () => {
    const text = build([sp('b', 10)])
    expect(text).toContain('⚪ *שחקנים מאוזנים*')
    expect(text).not.toContain('שחקנים במינוס')
    expect(text).not.toContain('שחקנים בפלוס')
    expect(text).toContain(`= *${L}0 ₪${L}*`)
  })

  it('omits empty sections (no losers, no winners, no balanced, no transfers)', () => {
    const text = build([sp('a', 30)])
    expect(text).toContain('שחקנים בפלוס')
    expect(text).not.toContain('שחקנים במינוס')
    expect(text).not.toContain('מאוזנים')
    expect(text).not.toContain('העברות')
  })

  it('orders losers most-negative first and winners most-positive first, ties by id', () => {
    const text = build([
      sp('x', -10), // -20
      sp('z', -40), // -50
      sp('b', -20), // -30
      sp('a', -20), // -30 (tie with b)
      sp('p', 10), // 0 -> balanced, not listed above
      sp('q', 60), // +50
      sp('r', 30), // +20
    ])
    const order = [...text.matchAll(/• (\w)/g)].map((m) => m[1])
    expect(order).toEqual(['z', 'a', 'b', 'x', 'q', 'r', 'p'])
  })

  it('transfers: "X pays Y amount", with the group fund named', () => {
    const text = build(
      [sp('a', -50), sp('b', 40)],
      [
        { from: 'a', to: 'b', amount: 30 },
        { from: 'a', to: PAYBOX_ID, amount: 30 },
      ],
    )
    expect(text).toContain(`${R}💸 *העברות*`)
    expect(text).toContain(`${R}• a${R} משלם ל-b${R} ${L}30 ₪${L}`)
    expect(text).toContain(`${R}• a${R} משלם ל-קופת PayBox${R} ${L}30 ₪${L}`)
  })
})
