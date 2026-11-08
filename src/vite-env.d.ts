/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** https link to the group's PayBox; the link is hidden when unset. */
  readonly VITE_PAYBOX_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
