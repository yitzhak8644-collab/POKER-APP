import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { computeGame } from '../../lib/finance'
import type { GameBundle } from '../games/types'
import { SettingsPanel } from './SettingsPanel'

// The panel builds the join link from window.location (not available when rendering in Node).
;(globalThis as { window?: unknown }).window ??= { location: { origin: 'https://example.test' } }

const bundle = {
  game: { status: 'open', join_code: 'ABC123' },
  players: [
    { id: 'a', display_name: 'אבי', role: 'guest', avatar_url: null, seat: null },
    { id: 'b', display_name: 'בני', role: 'guest', avatar_url: null, seat: null },
  ],
  transactions: [{ id: 't1', player_id: 'a', type: 'buy_in', amount: 100, voided_at: null }],
  settlement: null,
} as unknown as GameBundle

const result = computeGame(
  [
    { id: 'a', name: 'אבי', role: 'guest', invested: 100, cashOut: null },
    { id: 'b', name: 'בני', role: 'guest', invested: 0, cashOut: null },
  ],
  new Date(2026, 10, 20),
)

const render = (isAdmin: boolean): string =>
  renderToStaticMarkup(
    <SettingsPanel
      bundle={bundle}
      result={result}
      canManage
      isAdmin={isAdmin}
      onAddPlayer={async () => undefined}
      onRemovePlayer={async () => undefined}
      onAdminRemovePlayer={async () => undefined}
      onSetRole={async () => undefined}
    />,
  )

describe('removing a player from a table', () => {
  it('the general admin may remove a player who already has entries', () => {
    const html = render(true)
    expect(html).toContain('הסר (מנהל)')
    expect(html.match(/הסר \(מנהל\)/g)?.length).toBe(1) // only the player with entries
  })

  it('the table manager still cannot remove a player with entries', () => {
    const html = render(false)
    expect(html).not.toContain('הסר (מנהל)')
    expect(html).toContain('title="אי אפשר להסיר שחקן שיש לו רישומים"')
  })
})
