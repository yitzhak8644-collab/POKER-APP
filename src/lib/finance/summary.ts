import type { SettledPlayer, Transfer } from './types'

const RLM = '‏' // right-to-left mark: forces an RTL line / keeps names from flipping punctuation
const LRM = '‎' // left-to-right mark: keeps "-50 ₪" rendering as written inside RTL text

export interface SummaryInput {
  date: Date
  /** Total money put into the game (buy-ins + rebuys). */
  pot: number
  groupFund: number
  players: readonly SettledPlayer[]
  transfers: readonly Transfer[]
}

/** DD/MM/YYYY in Israel time (built from parts so it does not depend on locale data). */
export function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string): string =>
    parts
      .filter((p) => p.type === type)
      .map((p) => p.value)
      .join('')
  return `${part('day')}/${part('month')}/${part('year')}`
}

const NBSP = '\u00A0' // keeps a number and its ₪ on the same line when WhatsApp wraps
const signed = (n: number): string => `${LRM}${n > 0 ? '+' : ''}${n}${NBSP}₪${LRM}`

function playerLine(p: SettledPlayer): string {
  return `${RLM}${p.name}${RLM} ${signed(p.obligation)}`
}

/**
 * Hebrew WhatsApp summary: who is in the plus, in the minus, and balanced at zero, with each player's
 * NET amount (poker result minus entry fee, plus the hosting payout for the host). No "who pays whom".
 */
export function buildWhatsAppSummary(input: SummaryInput): string {
  const sorted = (rows: SettledPlayer[]): SettledPlayer[] =>
    rows.sort((a, b) => a.obligation - b.obligation || (a.id < b.id ? -1 : 1))
  const losers = sorted(input.players.filter((p) => p.obligation < 0))
  const winners = sorted(input.players.filter((p) => p.obligation > 0)).reverse()
  const even = sorted(input.players.filter((p) => p.obligation === 0))

  const lines: string[] = [`${RLM}🃏 *סיכום ערב פוקר* · ${formatDate(input.date)}`]
  const section = (title: string, rows: SettledPlayer[]): void => {
    if (rows.length === 0) return
    lines.push('', `${RLM}*${title}*`, ...rows.map(playerLine))
  }
  section('פלוס:', winners)
  section('מינוס:', losers)
  section('מאוזן:', even)
  return lines.join('\n')
}
