import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { computeGame, type Player } from '../../lib/finance'
import type { GameBundle } from '../games/types'
import { SettlementPanel } from './SettlementPanel'
import { TablePanel } from './TablePanel'

const roster: Player[] = [
  { id: 'h', name: 'מארח', role: 'host', invested: 100, cashOut: 60 },
  { id: 'a', name: 'אבי', role: 'guest', invested: 100, cashOut: 220 },
  { id: 'b', name: 'בני', role: 'guest', invested: 150, cashOut: null },
]

const bundle = (open = true): GameBundle =>
  ({
    game: { status: open ? 'open' : 'closed' },
    players: roster.map((p) => ({ id: p.id, avatar_url: null, seat: null })),
    transactions: [],
    settlement: null,
  }) as unknown as GameBundle

const settlement = (players: Player[]): string => {
  const result = computeGame(players, new Date(2026, 10, 20))
  return renderToStaticMarkup(
    <SettlementPanel
      bundle={bundle()}
      result={result}
      isOwner
      onCashOut={async () => undefined}
      onVoid={async () => undefined}
      onCloseGame={async () => undefined}
    />,
  )
}

describe('money after Cash-out', () => {
  it('shows poker, fund + hosting as one number, and the total for whoever cashed out', () => {
    const html = settlement(roster)
    // guest: +120 poker, -10 fund+hosting, +110 total
    expect(html).toContain('+120 ₪')
    expect(html).toContain('-10 ₪')
    expect(html).toContain('+110 ₪')
    // host: -40 poker, -5 + 5 per guest (2) = +5, total -35
    expect(html).toContain('-40 ₪')
    expect(html).toContain('+5 ₪')
    expect(html).toContain('-35 ₪')
    expect(html.match(/קופה ואירוח/g)?.length).toBe(2)
  })

  it('the Cash-out box is on its own line under the name', () => {
    const html = settlement(roster)
    expect(html).toMatch(/<div class="truncate font-semibold">בני<\/div>/)
    expect(html).toContain('placeholder="צ׳יפים"')
  })

  it('a bottom line says how much is still missing, then that everything is in', () => {
    expect(settlement(roster)).toContain('חסר ל-Cash-out: <bdi dir="ltr" class="font-num tabular-nums ">70 ₪</bdi> (עוד שחקן אחד)')
    const done = roster.map((p) => (p.id === 'b' ? { ...p, cashOut: 70 } : p))
    expect(settlement(done)).toContain('✓ הכול הוזן')
    const over = roster.map((p) => (p.id === 'b' ? { ...p, cashOut: 90 } : p))
    expect(settlement(over)).toContain('עודף ב-Cash-out')
  })

  it('the table screen shows the same line once a Cash-out is in', () => {
    const result = computeGame(roster, new Date(2026, 10, 20))
    const html = renderToStaticMarkup(
      <TablePanel result={result} seats={bundle().players} canWrite={false} onBuyIn={() => undefined} onRebuy={() => undefined} />,
    )
    expect(html.match(/קופה ואירוח/g)?.length).toBe(2)
    expect(html).toContain('+110 ₪')
  })
})
