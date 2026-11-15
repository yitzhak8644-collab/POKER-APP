import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyAction, cardsOf, createState, freshDeck, publicView, type Action, type Card, type Ctx, type State } from '../../lib/holdem/engine'
import { ActionBar } from './ActionBar'
import { TableView } from './TableView'

const T = 1_000_000
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: T, rand: () => 0, ...over })

function stacked(first: string): Card[] {
  const want = first.split(' ')
  return [...freshDeck().filter((c) => !want.includes(c)), ...[...want].reverse()]
}

/** `n` players (u0, u1, ...) with the first hand dealt; button = seat 0. */
function table(n: number, deck?: string): State {
  let st = createState('u0')
  for (let i = 0; i < n; i++) st = applyAction(st, `u${i}`, { type: 'sit', seat: i }, ctx({ profile: { name: `P${i}`, avatar: null } }))
  return applyAction(st, 'u0', { type: 'tick' }, ctx({ now: T + 60_000, deck: deck ? stacked(deck) : undefined }))
}

const act = (st: State, seat: number, action: Action): State => applyAction(st, `u${seat}`, action, ctx({ now: T + 61_000 }))

const bar = (st: State, user: string): string =>
  renderToStaticMarkup(
    <ActionBar pub={publicView(st, 1)} me={user} cards={cardsOf(st, user)} offset={0} act={async () => true} busy={false} error={null} onFinish={() => undefined} />,
  )

describe('the bar under the Hold\'em table', () => {
  it('shows fold / call / raise when it is my turn', () => {
    const html = bar(table(3), 'u0')
    expect(html).toContain('hl-btn fold')
    expect(html).toContain('hl-btn call')
    expect(html).toContain('hl-btn raise')
    expect(html).not.toContain('hl-pre')
  })

  it('offers Call Any / check / fold in advance while waiting for my turn', () => {
    const st = table(3)
    const html = bar(st, 'u1')
    expect(html).toContain('>Call Any<')
    expect(html).toContain('hl-pre fold')
    expect(html).toMatch(/class="hl-pre check "[^>]*>צ׳ק</)
    expect(html).not.toMatch(/class="hl-pre check "[^>]*disabled/)
    // once somebody bets, a plain check is impossible
    expect(bar(act(st, 0, { type: 'raise', to: 20 }), 'u2')).toMatch(/class="hl-pre check "[^>]*disabled/)
  })

  it('does not offer advance choices to a player who folded', () => {
    const st = act(table(3), 0, { type: 'fold' })
    expect(bar(st, 'u0')).not.toContain('hl-pre')
  })

  it('lets a player who ran out of chips rebuy or finish', () => {
    let st = table(2, 'As Ah Kc Kd 2c 7d 9h 3s 4d')
    st = act(st, 0, { type: 'raise', to: 250 })
    st = act(st, 1, { type: 'call' })
    const html = bar(st, 'u0')
    expect(html).toContain('>סיימתי<')
    expect(html).toContain('ריביי')
    expect(bar(st, 'u1')).not.toContain('סיימתי')
  })

  it('offers Show (in English) after the hand to a player whose cards are still hidden', () => {
    let st = table(2)
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'fold' })
    expect(bar(st, 'u1')).toContain('>Show<')
    expect(bar(act(st, 1, { type: 'show' }), 'u1')).not.toContain('>Show<')
  })

  it('tells a player who sits out that the seat and the chips are kept', () => {
    let st = act(table(3), 0, { type: 'fold' })
    st = act(st, 0, { type: 'sit_out' })
    const html = bar(st, 'u0')
    expect(html).toContain('אתה יושב בחוץ')
    expect(html).toContain('250')
    expect(html).toContain('חזרתי לשחק')
  })

  it('offers a rebuy between hands to a player below 40 chips', () => {
    let st = act(table(3), 0, { type: 'fold' })
    st.seats[0] = { ...(st.seats[0] as NonNullable<State['seats'][number]>), stack: 35 }
    st = act(st, 1, { type: 'fold' })
    // during the Show window: Show plus a rebuy button
    expect(bar(st, 'u0')).toContain('>Show<')
    expect(bar(st, 'u0')).toContain('ריביי')
    // after showing: the low-stack message
    st = act(st, 0, { type: 'show' })
    expect(bar(st, 'u0')).toContain('נשארו לך 35 צ׳יפים')
    expect(bar(st, 'u0')).toContain('ריביי')
  })

  it('invites a visitor to join', () => {
    expect(bar(table(2), 'visitor')).toContain('הצטרפות לשולחן')
  })
})

describe('the Hold\'em table', () => {
  it('draws one dealer button, the bets as chips and only my own cards face up', () => {
    const st = table(3, 'As Ah Kc Kd Qc Qd')
    const html = renderToStaticMarkup(<TableView pub={publicView(st, 1)} me="u1" cards={cardsOf(st, 'u1')} offset={0} />)
    expect(html.split('hl-dealer').length - 1).toBe(1)
    expect(html).toContain('hl-chip')
    expect(html).toContain('aria-label="A עלה"')
    expect(html).not.toContain('aria-label="K תלתן"')
    expect(html.split('hl-card back').length - 1).toBe(4) // two opponents, two face-down cards each
  })

  it('announces a 7-2 win and tags who paid', () => {
    let st = table(2, 'As Ah 7c 2d')
    st = act(st, 0, { type: 'raise', to: 20 })
    st = act(st, 1, { type: 'fold' })
    const html = renderToStaticMarkup(<TableView pub={publicView(st, 1)} me="u1" cards={cardsOf(st, 'u1')} offset={0} />)
    expect(html).toContain('7-2! P0 זכה ומקבל 40 מכל אחד (40)')
    expect(html).toContain('7-2 ‎-40')
    expect(html).toContain('aria-label="7 תלתן"')
  })

  it('marks a sitting-out player and still shows the stack', () => {
    let st = act(table(3), 0, { type: 'fold' })
    st = act(st, 0, { type: 'sit_out' })
    const html = renderToStaticMarkup(<TableView pub={publicView(st, 1)} me="u1" cards={cardsOf(st, 'u1')} offset={0} />)
    expect(html).toContain('יושב בחוץ')
    expect(html).toContain('is-out')
    expect(html).toMatch(/hl-stack[^>]*>250</)
  })
})
