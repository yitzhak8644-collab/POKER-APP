// Online Texas Hold'em: the authoritative game server.
// Every move goes through here. The full state (deck, face-down cards) lives in public.holdem_private,
// which no client can read; clients get `pub` (Realtime on holdem_tables) and their own two cards.
// engine.ts is a verbatim copy of src/lib/holdem/engine.ts (a vitest test fails if they differ).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  applyAction,
  cardsOf,
  createState,
  HoldemError,
  holeByUser,
  publicView,
  type Action,
  type Ctx,
  type State,
} from './engine.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

/** A table nobody touched for this long is closed when someone wants to open a new one. */
const STALE_HOURS = 3
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })

/** Unbiased integer in [0, n) from the platform CSPRNG. */
function rand(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

async function isAdmin(uid: string): Promise<boolean> {
  const { data, error } = await db.from('app_admins').select('user_id').eq('user_id', uid).maybeSingle()
  if (error) throw error
  return data !== null
}

async function profileOf(uid: string): Promise<{ name: string; avatar: string | null }> {
  const { data, error } = await db.from('profiles').select('display_name,avatar_url').eq('id', uid).maybeSingle()
  if (error) throw error
  return { name: data?.display_name || 'שחקן', avatar: data?.avatar_url ?? null }
}

async function openTableId(): Promise<string | null> {
  const { data, error } = await db.from('holdem_tables').select('id').eq('status', 'open').maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function create(uid: string): Promise<unknown> {
  const admin = await isAdmin(uid)
  if (!admin) {
    const { data } = await db.from('holdem_settings').select('open_to_all').maybeSingle()
    if (data?.open_to_all !== true) throw new HoldemError('NOT_ALLOWED')
  }
  const stale = await db.rpc('holdem_close_stale', { p_hours: STALE_HOURS })
  if (stale.error) throw stale.error
  const existing = await openTableId()
  if (existing !== null) return { error: 'OPEN_TABLE_EXISTS', tableId: existing }

  let state = createState(uid)
  state = applyAction(state, uid, { type: 'sit' }, { now: Date.now(), rand, profile: await profileOf(uid) })
  const pub = publicView(state, 1)
  const { data, error } = await db.rpc('holdem_create', { p_owner: uid, p_state: state, p_pub: pub })
  if (error) {
    if (String(error.message).includes('holdem_tables_one_open')) {
      return { error: 'OPEN_TABLE_EXISTS', tableId: await openTableId() }
    }
    throw error
  }
  return { tableId: data, pub, cards: null }
}

function cleanAction(raw: unknown): Action {
  const a = (raw ?? {}) as Record<string, unknown>
  switch (a.type) {
    case 'sit':
      return a.seat === undefined || a.seat === null ? { type: 'sit' } : { type: 'sit', seat: Number(a.seat) }
    case 'raise':
      return { type: 'raise', to: Number(a.to) }
    case 'leave':
    case 'rebuy':
    case 'sit_out':
    case 'sit_in':
    case 'fold':
    case 'check':
    case 'call':
    case 'show':
    case 'tick':
    case 'close':
      return { type: a.type }
    default:
      throw new HoldemError('BAD_REQUEST')
  }
}

async function act(uid: string, tableId: string, action: Action): Promise<unknown> {
  if (!UUID.test(tableId)) throw new HoldemError('BAD_REQUEST')
  const admin = action.type === 'close' ? await isAdmin(uid) : false
  const profile = action.type === 'sit' ? await profileOf(uid) : undefined

  // Optimistic concurrency: read, apply, write only if nobody else wrote in between; otherwise retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await db.from('holdem_private').select('version,state').eq('table_id', tableId).maybeSingle()
    if (error) throw error
    if (row === null) throw new HoldemError('TABLE_NOT_FOUND')
    const state = row.state as State
    const ctx: Ctx = { now: Date.now(), rand, isAdmin: admin, profile }
    const next = applyAction(state, uid, action, ctx)
    if (next === state) return { pub: publicView(state, row.version), cards: cardsOf(state, uid) }

    const pub = publicView(next, row.version + 1)
    const newHand = next.hand !== null && next.hand.no !== (state.hand?.no ?? 0)
    const commit = await db.rpc('holdem_commit', {
      p_table_id: tableId,
      p_expected: row.version,
      p_state: next,
      p_pub: pub,
      p_closed: next.closed,
      p_hand_no: next.hand?.no ?? 0,
      p_hole: newHand ? holeByUser(next) : null,
    })
    if (commit.error) throw commit.error
    if (commit.data === true) return { pub, cards: cardsOf(next, uid) }
  }
  throw new HoldemError('BUSY')
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await db.auth.getUser(token)
    if (authError || !auth?.user) return json({ error: 'NOT_AUTHENTICATED' })
    const uid = auth.user.id

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    switch (body.op) {
      case 'time':
        return json({ now: Date.now() })
      case 'create':
        return json(await create(uid))
      case 'act':
        return json(await act(uid, String(body.tableId ?? ''), cleanAction(body.action)))
      default:
        return json({ error: 'BAD_REQUEST' })
    }
  } catch (err) {
    if (err instanceof HoldemError) return json({ error: err.code })
    console.error('holdem error', err)
    return json({ error: 'SERVER_ERROR' })
  }
})
