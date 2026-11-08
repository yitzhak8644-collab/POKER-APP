/**
 * The group's PayBox. Not editable inside the app: members tap this link to join / pay, so it must not
 * be something any member can change. The default is the group's public invite link (not a secret);
 * VITE_PAYBOX_URL can override it at deploy time. Only https: URLs are ever accepted
 * (never javascript:, data:, http:), and an invalid override falls back to the default.
 */
export const DEFAULT_PAYBOX_URL = 'https://links.payboxapp.com/6jbgpvhOgYb'
export const DEFAULT_PAYBOX_GROUP_NAME = 'ועד P שלוחות'

export function parsePayBoxUrl(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export const resolvePayBoxUrl = (override: string | undefined): string =>
  parsePayBoxUrl(override) ?? DEFAULT_PAYBOX_URL

export const resolveGroupName = (override: string | undefined): string =>
  override?.trim() || DEFAULT_PAYBOX_GROUP_NAME

export const PAYBOX_URL: string = resolvePayBoxUrl(import.meta.env.VITE_PAYBOX_URL)
export const PAYBOX_GROUP_NAME: string = resolveGroupName(import.meta.env.VITE_PAYBOX_GROUP_NAME)
