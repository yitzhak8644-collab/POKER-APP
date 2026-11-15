// Sends a Web Push to everyone who allowed notifications when a table opens.
// Called only by the database triggers (public.notify_table_opened / notify_holdem_table_opened) with the
// shared secret in `x-push-secret`, so it is deployed with verify_jwt = false and does its own authentication.
// The VAPID key pair is generated on first use and kept in public.push_config (unreadable by clients).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { createECDH } from 'node:crypto'

const SITE = 'https://poker-tracker-cyan.vercel.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

async function loadConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('push_config').select('key,value')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
}

async function ensureVapid(cfg: Record<string, string>): Promise<{ pub: string; priv: string }> {
  if (cfg.vapid_public && cfg.vapid_private) return { pub: cfg.vapid_public, priv: cfg.vapid_private }
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const pub = ecdh.getPublicKey().toString('base64url')
  const priv = ecdh.getPrivateKey().toString('base64url')
  const { error } = await supabase.from('push_config').upsert([
    { key: 'vapid_public', value: pub },
    { key: 'vapid_private', value: priv },
  ])
  if (error) throw error
  return { pub, priv }
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  try {
    const cfg = await loadConfig()
    const given = req.headers.get('x-push-secret') ?? ''
    if (!cfg.trigger_secret || !sameSecret(given, cfg.trigger_secret)) {
      return new Response('forbidden', { status: 403 })
    }
    const vapid = await ensureVapid(cfg)
    const body = await req.json().catch(() => ({}))
    if (body.action === 'init') return Response.json({ ok: true, initialised: true })

    let ownerId: string
    let message: { title: string; body: (name: string) => string; url: string; tag: string }
    if (body.holdem_table_id !== undefined) {
      // An online Hold'em table (cash or tournament).
      const tableId = String(body.holdem_table_id ?? '')
      if (!UUID.test(tableId)) return Response.json({ ok: true, sent: 0, reason: 'bad id' })
      const { data: table } = await supabase.from('holdem_tables').select('id, owner_id, status, pub').eq('id', tableId).maybeSingle()
      if (!table || table.status !== 'open') return Response.json({ ok: true, sent: 0, reason: 'no open table' })
      ownerId = table.owner_id
      const tournament = table.pub?.tournament != null
      message = tournament
        ? { title: 'טורניר הולדם נפתח! 🏆', body: (n) => `${n} פתח טורניר הולדם אונליין. לחצו להרשמה.`, url: `/holdem/${tableId}`, tag: 'holdem-open' }
        : { title: 'שולחן הולדם אונליין נפתח! ♠️', body: (n) => `${n} פתח שולחן הולדם אונליין. לחצו להצטרפות.`, url: `/holdem/${tableId}`, tag: 'holdem-open' }
    } else {
      const gameId = String(body.game_id ?? '')
      const { data: game } = await supabase.from('games').select('id, owner_id, status').eq('id', gameId).maybeSingle()
      if (!game || game.status !== 'open') return Response.json({ ok: true, sent: 0, reason: 'no open game' })
      ownerId = game.owner_id
      message = { title: 'יש שולחן פתוח!', body: (n) => `${n} פתח שולחן. לחצו להצטרפות.`, url: '/', tag: 'table-opened' }
    }

    const { data: owner } = await supabase.from('profiles').select('display_name').eq('id', ownerId).maybeSingle()
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .neq('user_id', ownerId)

    webpush.setVapidDetails(SITE, vapid.pub, vapid.priv)
    const payload = JSON.stringify({
      title: message.title,
      body: message.body(owner?.display_name || 'מישהו'),
      url: message.url,
      tag: message.tag,
    })

    let sent = 0
    const gone: string[] = []
    await Promise.all(
      (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 3600,
            urgency: 'high',
          })
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) gone.push(s.endpoint)
        }
      }),
    )
    if (gone.length > 0) await supabase.from('push_subscriptions').delete().in('endpoint', gone)
    return Response.json({ ok: true, sent, removed: gone.length })
  } catch (err) {
    console.error('notify-table-opened failed', err)
    return new Response('error', { status: 500 })
  }
})
