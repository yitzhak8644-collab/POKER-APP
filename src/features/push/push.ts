import { getSupabase } from '../../lib/supabase'

/** Web Push needs a service worker, the Push API and Notifications (on iPhone: only after "Add to Home Screen"). */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function pushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function fetchPublicKey(): Promise<string> {
  const { data, error } = await getSupabase().rpc('push_public_key')
  if (error) throw error
  if (typeof data !== 'string' || data === '') throw new Error('push is not configured')
  return data
}

/** Subscribes this browser (permission must already be granted) and stores the subscription. */
export async function subscribeToPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (subscription === null) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await fetchPublicKey()),
    })
  }
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) throw new Error('invalid push subscription')
  const { error } = await getSupabase().rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  })
  if (error) throw error
}

/** Asks for permission (must run from a tap) and subscribes. Returns the resulting permission. */
export async function enablePush(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported'
  const result = await Notification.requestPermission()
  if (result === 'granted') await subscribeToPush()
  return result
}
