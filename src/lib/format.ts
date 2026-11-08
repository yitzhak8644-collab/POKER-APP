const TZ = 'Asia/Jerusalem'

export const formatMoney = (n: number, opts: { signed?: boolean } = {}): string =>
  `${opts.signed && n > 0 ? '+' : ''}${n} ₪`

/** `2026-11-05` -> `05/11/2026` (pure string work, no timezone surprises). */
export function formatGameDate(playedOn: string): string {
  const [y, m, d] = playedOn.split('-')
  return `${d}/${m}/${y}`
}

/** `05/11 21:30` in Israel time, 24h. */
export function formatDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const part = (type: string) => parts.filter((p) => p.type === type).map((p) => p.value).join('')
  return `${part('day')}/${part('month')} ${part('hour')}:${part('minute')}`
}

/** Today's date (YYYY-MM-DD) in Israel time. */
export function todayInIsrael(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
  const part = (type: string) => parts.filter((p) => p.type === type).map((p) => p.value).join('')
  return `${part('year')}-${part('month')}-${part('day')}`
}
