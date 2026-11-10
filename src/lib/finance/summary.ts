import { PAYBOX_ID, PAYBOX_LABEL } from './config'
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
const money = (n: number): string => `${LRM}${n}${NBSP}₪${LRM}`
const signed = (n: number): string => `${LRM}${n > 0 ? '+' : ''}${n}${NBSP}₪${LRM}`

function playerLine(p: SettledPlayer): string {
  const parts = [`פוקר ${signed(p.net)}`, `כניסה ${signed(-p.entryFee)}`]
  if (p.hostPayout > 0) parts.push(`אירוח ${signed(p.hostPayout)}`)
  return `${RLM}• ${p.name}${RLM}: ${parts.join(', ')} = *${signed(p.obligation)}*`
}

/** Hebrew WhatsApp summary. Sections are classified by the FINAL obligation. */
export function buildWhatsAppSummary(input: SummaryInput): string {
  const names = new Map<string, string>(input.players.map((p) => [p.id, p.name]))
  names.set(PAYBOX_ID, PAYBOX_LABEL)

  const sorted = (rows: SettledPlayer[]): SettledPlayer[] =>
    rows.sort((a, b) => a.obligation - b.obligation || (a.id < b.id ? -1 : 1))
  const losers = sorted(input.players.filter((p) => p.obligation < 0))
  const winners = sorted(input.players.filter((p) => p.obligation > 0)).reverse()
  const even = sorted(input.players.filter((p) => p.obligation === 0))

  const lines: string[] = [
    `${RLM}🃏 *סיכום ערב פוקר*`,
    `${RLM}📅 ${formatDate(input.date)} | 💰 קופת המשחק: ${money(input.pot)}`,
  ]
  const section = (title: string, rows: string[]): void => {
    if (rows.length === 0) return
    lines.push('', `${RLM}${title}`, ...rows)
  }

  section('🔴 *שחקנים במינוס*', losers.map(playerLine))
  section('🟢 *שחקנים בפלוס*', winners.map(playerLine))
  section('⚪ *שחקנים מאוזנים*', even.map(playerLine))
  lines.push('', `${RLM}🏦 *קופה קבוצתית שנאספה*: ${money(input.groupFund)}`)
  section(
    '💸 *העברות*',
    input.transfers.map(
      (t) =>
        `${RLM}• ${names.get(t.from) as string}${RLM} משלם ל-${names.get(t.to) as string}${RLM} ${money(t.amount)}`,
    ),
  )
  return lines.join('\n')
}
