import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoryItem, type HistoryGame } from './HistoryPage'

const game: HistoryGame = {
  game_id: 'g1',
  played_on: '2026-11-19',
  closed_at: '2026-11-19T23:40:00Z',
  host_name: 'נירית',
  players: 12,
  pot: '975',
  summary: 'סיכום ערב פוקר\nפלוס: א +10',
}

describe('game history', () => {
  it('shows date, host, players and pot; the summary opens with a WhatsApp button', () => {
    const closed = renderToStaticMarkup(<HistoryItem g={game} />)
    expect(closed).toContain('19/11/2026')
    expect(closed).toContain('אצל <bdi>נירית</bdi>')
    expect(closed).toContain('12 שחקנים')
    expect(closed).toContain('975')
    expect(closed).not.toContain('סיכום ערב פוקר')
    const open = renderToStaticMarkup(<HistoryItem g={game} initiallyOpen />)
    expect(open).toContain('סיכום ערב פוקר')
    expect(open).toContain('שליחה בוואטסאפ')
  })

  it('a game without a stored summary says so', () => {
    expect(renderToStaticMarkup(<HistoryItem g={{ ...game, summary: null }} initiallyOpen />)).toContain('אין סיכום שמור')
  })
})
