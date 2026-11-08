import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** `false` until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error('SUPABASE_NOT_CONFIGURED')
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}
