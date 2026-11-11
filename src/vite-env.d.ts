/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Optional override of the built-in PayBox group link (https only; invalid values are ignored). */
  readonly VITE_PAYBOX_URL?: string
  /** Optional override of the PayBox group's display name. */
  readonly VITE_PAYBOX_GROUP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
