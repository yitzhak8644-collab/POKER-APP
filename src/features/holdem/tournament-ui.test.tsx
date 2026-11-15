import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyAction, cardsOf, createState, DEFAULT_CONFIG, publicView, type Action, type Ctx, type State } from '../../lib/holdem/engine'
import { ActionBar } from './ActionBar'
import { RegisterPanel, TournamentResults, TournamentStandings } from './Tournament'

// The bar reads the real clock (rebuy / registration windows), so the tournament starts "now".
const T = Date.now()
const ctx = (now: number, over: Partial<Ctx> = {}): Ctx => ({ now, rand: () => 0, ...over })
const act = (st: State, user: string, a: Action, now = T + 6_000): State => applyAction(st, user, a, ctx(now))

function registered(n: number): State {
  let st = createState('u0', DEFAULT_CONFIG, { tournament: {} })
  for (let i = 0; i < n; i++) st = applyAction(st, `u${i}`, { type: 'sit', seat: i }, ctx(T, { profile: { name: `P${i}`, avatar: null } }))
  return st
}

function running(n: number): State {
  const st = act(registered(n), 'u0', { type: 'start' }, T)
  return act(st, 'u0', { type: 'tick' }, T + 5_000)
}

/** Everybody folds: the hand ends. */
function foldOut(st: State): State {
  let s = st
  while (s.phase === 'hand' && s.hand?.toAct != null) s = act(s, (s.seats[s.hand.toAct] as { userId: string }).userId, { type: 'fold' })
  return s
}

const bar = (st: State, user: string): string =>
  renderToStaticMarkup(
    <ActionBar pub={publicView(st, 1)} me={user} cards={cardsOf(st, user)} offset={0} act={async () => true} busy={false} error={null} onFinish={() => undefined} />,
  )

describe('tournament screens', () => {
  it('before the start: the opener gets the start button, the others wait', () => {
    const pub = publicView(registered(3), 1)
    const owner = renderToStaticMarkup(<RegisterPanel pub={pub} me="u0" canStart act={async () => true} busy={false} />)
    expect(owner).toContain('התחל טורניר')
    expect(owner).toContain('נרשמו (3)')
    const other = renderToStaticMarkup(<RegisterPanel pub={pub} me="u1" canStart={false} act={async () => true} busy={false} />)
    expect(other).not.toContain('התחל טורניר')
    expect(other).toContain('ממתינים ש-')
    expect(bar(registered(3), 'u1')).toContain('ממתינים שהפותח יתחיל')
  })

  it('out of chips while rebuys are open: rebuy 250 or done', () => {
    const st = foldOut(running(3))
    const s2 = st.seats[2] as NonNullable<State['seats'][number]>
    ;(st.seats[0] as NonNullable<State['seats'][number]>).stack += s2.stack
    s2.stack = 0
    const html = bar(st, 'u2')
    expect(html).toContain('>סיימתי<')
    expect(html).toContain('ריביי')
    expect(html).toContain('>250<')
  })

  it('a player who was knocked out watches and sees the place', () => {
    let st = foldOut(running(3))
    const s2 = st.seats[2] as NonNullable<State['seats'][number]>
    ;(st.seats[0] as NonNullable<State['seats'][number]>).stack += s2.stack
    s2.stack = 0
    st = act(st, 'u2', { type: 'bust' })
    expect(bar(st, 'u2')).toContain('הודחת במקום 3')
    const menu = renderToStaticMarkup(<TournamentStandings pub={publicView(st, 1)} me="u0" offset={0} />)
    expect(menu).toContain('הודח')
    expect(menu).toContain('5/5')
  })

  it('a newcomer can register during the first level', () => {
    expect(bar(running(2), 'u9')).toContain('הרשמה לטורניר')
  })

  it('the results show the winner and the places', () => {
    let st = foldOut(running(2))
    const s1 = st.seats[1] as NonNullable<State['seats'][number]>
    ;(st.seats[0] as NonNullable<State['seats'][number]>).stack += s1.stack
    s1.stack = 0
    st = act(st, 'u1', { type: 'bust' })
    expect(st.closed).toBe(true)
    const html = renderToStaticMarkup(<TournamentResults pub={publicView(st, 1)} me="u1" />)
    expect(html).toContain('P0 זכה בטורניר!')
    expect(html).toContain('🥈')
  })
})
