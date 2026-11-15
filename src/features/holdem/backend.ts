import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  applyAction,
  cardsOf,
  createState,
  publicView,
  seatIndexOf,
  type Action,
  type Card,
  type Ctx,
  type PublicState,
  type State,
} from '../../lib/holdem/engine'
import { getSupabase } from '../../lib/supabase'
import { botAction } from './bots'

/** What one client knows: the public table plus its own two cards. */
export interface TableSnapshot {
  pub: PublicState
  cards: Card[] | null
}

export interface HoldemBackend {
  readonly me: string
  /** Practice mode: everything runs in this browser against bots. */
  readonly practice: boolean
  /** Server clock minus this device's clock, in ms. */
  offset(): number
  subscribe(listener: (snap: TableSnapshot) => void): () => void
  /** Rejects with an Error whose message is a stable key (see lib/errors.ts). */
  send(action: Action): Promise<void>
  dispose(): void
}

interface FnResult {
  error?: string
  tableId?: string
  pub?: PublicState
  cards?: Card[] | null
  now?: number
}

async function callHoldem(body: Record<string, unknown>): Promise<FnResult> {
  const { data, error } = await getSupabase().functions.invoke('holdem', { body })
  if (error) {
    const name = (error as { name?: string }).name
    throw new Error(name === 'FunctionsFetchError' ? 'network error' : 'SERVER_ERROR')
  }
  return (data ?? {}) as FnResult
}

export interface OpenHoldemTable {
  id: string
  owner_id: string
  created_at: string
  pub: PublicState
}

export async function fetchOpenHoldemTable(): Promise<OpenHoldemTable | null> {
  const { data, error } = await getSupabase()
    .from('holdem_tables')
    .select('id,owner_id,created_at,pub')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as OpenHoldemTable | null) ?? null
}

/** May everybody open an online table, or only the admin (trial period)? */
export async function fetchHoldemOpenToAll(): Promise<boolean> {
  const { data, error } = await getSupabase().from('holdem_settings').select('open_to_all').maybeSingle()
  if (error) throw error
  return (data as { open_to_all?: boolean } | null)?.open_to_all === true
}

/** Opens a table (and sits the opener). If one is already open, returns that one. */
export async function createHoldemTable(): Promise<string> {
  const res = await callHoldem({ op: 'create' })
  if (res.tableId) return res.tableId
  throw new Error(res.error ?? 'SERVER_ERROR')
}

// ------------------------------------------------------------------------------------------- remote

export class RemoteBackend implements HoldemBackend {
  readonly practice = false
  readonly me: string
  private readonly tableId: string
  private readonly onMissing: () => void
  private snap: TableSnapshot | null = null
  private listeners = new Set<(snap: TableSnapshot) => void>()
  private clockOffset = 0
  /** Hand number the cached cards belong to. */
  private cardsHand = 0
  private loadingHand = 0
  private disposed = false
  private poll: ReturnType<typeof setInterval> | null = null
  private channel: RealtimeChannel | null = null

  constructor(tableId: string, me: string, onMissing: () => void) {
    this.tableId = tableId
    this.me = me
    this.onMissing = onMissing
    void this.start()
  }

  offset(): number {
    return this.clockOffset
  }

  subscribe(listener: (snap: TableSnapshot) => void): () => void {
    this.listeners.add(listener)
    if (this.snap) listener(this.snap)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async send(action: Action): Promise<void> {
    const res = await callHoldem({ op: 'act', tableId: this.tableId, action })
    if (res.error) throw new Error(res.error)
    if (res.pub) this.accept(res.pub, res.cards)
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    if (this.poll) clearInterval(this.poll)
    document.removeEventListener('visibilitychange', this.onVisible)
    if (this.channel) void getSupabase().removeChannel(this.channel)
  }

  private onVisible = (): void => {
    if (document.visibilityState === 'visible') void this.refresh()
  }

  private async start(): Promise<void> {
    await this.refresh()
    if (this.disposed) return
    void this.syncClock()
    this.channel = getSupabase()
      .channel(`holdem:${this.tableId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'holdem_tables', filter: `id=eq.${this.tableId}` },
        (payload) => {
          const pub = (payload.new as { pub?: PublicState }).pub
          if (pub) this.accept(pub)
        },
      )
      .subscribe()
    // Realtime can drop on a phone; a light poll keeps the table honest.
    this.poll = setInterval(this.onVisible, 4000)
    document.addEventListener('visibilitychange', this.onVisible)
  }

  private async refresh(): Promise<void> {
    const { data, error } = await getSupabase().from('holdem_tables').select('pub').eq('id', this.tableId).maybeSingle()
    if (this.disposed || error) return
    if (data === null) {
      this.onMissing()
      return
    }
    this.accept((data as { pub: PublicState }).pub)
  }

  private async syncClock(): Promise<void> {
    let best = Infinity
    for (let i = 0; i < 2; i++) {
      try {
        const t0 = Date.now()
        const res = await callHoldem({ op: 'time' })
        const t1 = Date.now()
        if (typeof res.now === 'number' && t1 - t0 < best) {
          best = t1 - t0
          this.clockOffset = res.now - (t0 + t1) / 2
        }
      } catch {
        // keep the previous offset
      }
    }
  }

  private emit(): void {
    if (this.snap) for (const l of this.listeners) l(this.snap)
  }

  private accept(pub: PublicState, cards?: Card[] | null): void {
    if (this.disposed) return
    const cur = this.snap
    if (cur && pub.v < cur.pub.v) return
    const handNo = pub.hand?.no ?? 0
    let mine = handNo === this.cardsHand ? (cur?.cards ?? null) : null
    if (cards && handNo > 0) {
      mine = cards
      this.cardsHand = handNo
    }
    this.snap = { pub, cards: mine }
    this.emit()
    if (handNo > 0 && this.cardsHand !== handNo) void this.loadCards(handNo)
  }

  /** My own two cards live in a table that row-level security lets only me read. */
  private async loadCards(handNo: number): Promise<void> {
    if (this.loadingHand === handNo) return
    const idx = this.snap ? seatIndexOf(this.snap.pub, this.me) : -1
    if (idx < 0 || this.snap?.pub.seats[idx]?.inHand !== true) {
      this.cardsHand = handNo
      return
    }
    this.loadingHand = handNo
    const { data } = await getSupabase()
      .from('holdem_hole_cards')
      .select('cards')
      .eq('table_id', this.tableId)
      .eq('hand_no', handNo)
      .eq('user_id', this.me)
      .maybeSingle()
    this.loadingHand = 0
    if (this.disposed || !this.snap || (this.snap.pub.hand?.no ?? 0) !== handNo) return
    const cards = (data as { cards?: Card[] } | null)?.cards ?? null
    if (cards === null) return // not written yet; the next update retries
    this.cardsHand = handNo
    this.snap = { ...this.snap, cards }
    this.emit()
  }
}

// ------------------------------------------------------------------------------------------- practice

const BOTS: { seat: number; name: string }[] = [
  { seat: 2, name: 'דני (בוט)' },
  { seat: 3, name: 'מיכל (בוט)' },
  { seat: 5, name: 'רון (בוט)' },
  { seat: 7, name: 'נועה (בוט)' },
  { seat: 8, name: 'גיל (בוט)' },
]

const localRand = (n: number): number => Math.floor(Math.random() * n)

/** The whole game in this browser: the same engine, five bots, nothing is sent anywhere. */
export class LocalBackend implements HoldemBackend {
  readonly practice = true
  readonly me = 'me'
  private state: State
  private v = 1
  private listeners = new Set<(snap: TableSnapshot) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(name: string, avatar: string | null) {
    let st = createState('me')
    st = applyAction(st, 'me', { type: 'sit', seat: 0 }, { ...this.ctx(), profile: { name, avatar } })
    BOTS.forEach((b, i) => {
      st = applyAction(st, `bot${i}`, { type: 'sit', seat: b.seat }, { ...this.ctx(), profile: { name: b.name, avatar: null }, bot: true })
    })
    this.state = st
    this.schedule()
  }

  offset(): number {
    return 0
  }

  subscribe(listener: (snap: TableSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  send(action: Action): Promise<void> {
    try {
      this.apply('me', action)
      return Promise.resolve()
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error('SERVER_ERROR'))
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    if (this.timer) clearTimeout(this.timer)
  }

  private ctx(): Ctx {
    return { now: Date.now(), rand: localRand }
  }

  private snapshot(): TableSnapshot {
    return { pub: publicView(this.state, this.v), cards: cardsOf(this.state, 'me') }
  }

  private apply(userId: string, action: Action): void {
    const next = applyAction(this.state, userId, action, this.ctx())
    if (next === this.state) return
    this.state = next
    this.v += 1
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
    this.schedule()
  }

  /** Lets the bots take their turn, rebuy and occasionally show a hand. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.disposed || this.state.closed) return
    const st = this.state
    const h = st.hand
    if (st.phase === 'hand' && h !== null && h.toAct !== null) {
      const idx = h.toAct
      const seat = st.seats[idx]
      if (!seat?.bot) return
      this.timer = setTimeout(() => {
        try {
          this.apply(seat.userId, botAction(this.state, idx))
        } catch {
          this.apply(seat.userId, { type: 'tick' })
        }
      }, 800 + Math.random() * 1300)
      return
    }
    this.timer = setTimeout(() => {
      this.state.seats.forEach((seat, i) => {
        if (!seat?.bot) return
        try {
          if (seat.stack === 0) this.apply(seat.userId, { type: 'rebuy' })
          else if (this.state.phase === 'between' && this.state.hand?.result && this.state.hand.hole[String(i)] && !seat.shown && Math.random() < 0.2) {
            this.apply(seat.userId, { type: 'show' })
          }
        } catch {
          // not allowed right now; try again after the next change
        }
      })
    }, 1500)
  }
}
