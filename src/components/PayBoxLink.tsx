import { PAYBOX_GROUP_NAME, PAYBOX_URL } from '../lib/paybox'

interface Props {
  /** `banner`: full-width call to action. `inline`: compact, for use next to an amount. */
  variant?: 'banner' | 'inline'
}

/** Opens the group's PayBox (the invite link: join the group, then pay / receive there). */
export function PayBoxLink({ variant = 'banner' }: Props) {
  const external = { href: PAYBOX_URL, target: '_blank', rel: 'noopener noreferrer' } as const
  if (variant === 'inline') {
    return (
      <a
        {...external}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500 bg-sky-950 px-3 py-1.5 text-sm font-semibold text-sky-200"
      >
        <span aria-hidden="true">💸</span>
        קבוצת PayBox · {PAYBOX_GROUP_NAME}
      </a>
    )
  }
  return (
    <a
      {...external}
      className="flex items-center gap-3 rounded-xl border border-sky-500 bg-sky-950 px-4 py-3 text-sky-200 active:scale-[0.98]"
    >
      <span aria-hidden="true" className="text-2xl">
        💸
      </span>
      <span className="flex flex-col">
        <span className="font-semibold">קבוצת PayBox · {PAYBOX_GROUP_NAME}</span>
        <span className="text-xs text-sky-300/80">לחצו להצטרפות לקבוצה ולתשלום, בחינם</span>
      </span>
    </a>
  )
}
