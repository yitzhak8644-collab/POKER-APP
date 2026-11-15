import { evaluate, RANKS, turnOptions, type Action, type State } from '../../lib/holdem/engine'

const round5 = (n: number): number => Math.round(n / 5) * 5
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/** A rough 0..1 feeling for how good the bot's hand is right now. */
function strength(st: State, idx: number): number {
  const h = st.hand
  const hole = h?.hole[String(idx)]
  if (!h || !hole || hole.length < 2) return 0
  const [a, b] = hole as [string, string]
  const ra = RANKS.indexOf(a.charAt(0))
  const rb = RANKS.indexOf(b.charAt(0))
  const hi = Math.max(ra, rb)
  const lo = Math.min(ra, rb)
  if (h.board.length === 0) {
    if (ra === rb) return 0.55 + (ra / 12) * 0.45
    let s = ((hi + lo) / 24) * 0.55
    if (a.charAt(1) === b.charAt(1)) s += 0.07
    if (hi - lo <= 1) s += 0.05
    if (hi >= 10) s += 0.1
    return Math.min(s, 0.8)
  }
  const score = evaluate([...hole, ...h.board]).score
  const cat = score[0] ?? 0
  if (cat === 0) return hi >= 11 ? 0.2 : 0.1
  if (cat === 1) {
    const pairRank = score[1] ?? 0
    const top = Math.max(...h.board.map((c) => RANKS.indexOf(c.charAt(0))))
    const mine = pairRank === ra || pairRank === rb
    if (!mine) return 0.25
    return pairRank >= top ? 0.62 : 0.42
  }
  return [0, 0, 0.74, 0.84, 0.9, 0.93, 0.97, 0.99, 1][cat] ?? 0.9
}

/** A simple, slightly unpredictable opponent for practice mode. Always returns a legal action. */
export function botAction(st: State, idx: number, random: () => number = Math.random): Action {
  const h = st.hand
  if (!h) return { type: 'check' }
  const opts = turnOptions(st, idx)
  const pot = st.seats.reduce((sum, s) => sum + (s ? s.committed : 0), 0)
  const s = strength(st, idx)
  const r = random()

  if (opts.canCheck) {
    const wantsBet = (s > 0.6 && r < 0.75) || (s > 0.4 && r < 0.25) || r < 0.06
    if (opts.canRaise && wantsBet) {
      const size = Math.max(st.config.bb * 2, round5(pot * (0.4 + r * 0.5)))
      return { type: 'raise', to: clamp(h.currentBet + size, opts.minTo, opts.maxTo) }
    }
    return { type: 'check' }
  }

  const odds = opts.toCall / (pot + opts.toCall)
  if (opts.canRaise && s > 0.84 && r < 0.6) {
    return { type: 'raise', to: clamp(round5(h.currentBet * 2.5 + pot * 0.3), opts.minTo, opts.maxTo) }
  }
  if (s >= odds + 0.12 || (opts.toCall <= st.config.bb * 2 && s > 0.2) || r < 0.04) return { type: 'call' }
  return { type: 'fold' }
}
