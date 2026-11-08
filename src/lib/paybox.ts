/**
 * Link to the group's PayBox. It is a deploy-time setting (VITE_PAYBOX_URL), not editable in the app:
 * members tap this link to pay, so it must not be something any member can change.
 * Only https: URLs are accepted (never javascript:, data:, http:). Unset or invalid = no link shown.
 */
export function parsePayBoxUrl(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export const PAYBOX_URL: string | null = parsePayBoxUrl(import.meta.env.VITE_PAYBOX_URL)
