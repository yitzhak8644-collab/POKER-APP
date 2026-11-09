// Sends a Web Push to everyone who allowed notifications when a table opens.
// Called only by the database trigger (public.notify_table_opened) with the shared secret in
// `x-push-secret`, so it is deployed with verify_jwt = false and does its own authentication.
// The VAPID key pair is generated on first use and kept in public.push_config (unreadable by clients).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { createECDH } from 'node:crypto'

const SITE = 'https://poker-tracker-cyan.vercel.app'

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

    const gameId = String(body.game_id ?? '')
    const { data: game } = await supabase.from('games').select('id, owner_id, status').eq('id', gameId).maybeSingle()
    if (!game || game.status !== 'open') return Response.json({ ok: true, sent: 0, reason: 'no open game' })

    const { data: owner } = await supabase.from('profiles').select('display_name').eq('id', game.owner_id).maybeSingle()
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .neq('user_id', game.owner_id)

    webpush.setVapidDetails(SITE, vapid.pub, vapid.priv)
    const payload = JSON.stringify({
      title: 'יש שולחן פתוח!',
      body: `${owner?.display_name || 'מישהו'} פתח שולחן. לחצו להצטרפות.`,
      url: '/',
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
