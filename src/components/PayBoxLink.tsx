import { PAYBOX_URL } from '../lib/paybox'

interface Props {
  /** `banner`: full-width call to action. `inline`: compact, for use next to an amount. */
  variant?: 'banner' | 'inline'
  label?: string
}

/** Opens the group's PayBox. Renders nothing when VITE_PAYBOX_URL is not configured. */
export function PayBoxLink({ variant = 'banner', label = 'לקבוצת PayBox' }: Props) {
  if (PAYBOX_URL === null) return null
  const cls =
    variant === 'banner'
      ? 'flex items-center justify-center gap-2 rounded-xl border border-sky-500 bg-sky-950 px-4 py-3 font-semibold text-sky-200 active:scale-[0.98]'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-sky-500 bg-sky-950 px-3 py-1.5 text-sm font-semibold text-sky-200'
  return (
    <a href={PAYBOX_URL} target="_blank" rel="noopener noreferrer" className={cls}>
      <span aria-hidden="true">💸</span>
      {label}
    </a>
  )
}
