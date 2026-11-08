import type { ReactNode } from 'react'
import { formatMoney } from '../lib/format'

export const btn =
  'rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
export const btnPrimary = `${btn} bg-emerald-500 text-slate-950`
export const btnSecondary = `${btn} bg-slate-800 text-slate-100 border border-slate-700`
export const btnDanger = `${btn} bg-rose-500 text-white`
export const inputCls =
  'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'

/** A number rendered left-to-right (so "-50 ₪" never flips inside Hebrew text), in the numeric font. */
export function Money({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  return (
    <bdi dir="ltr" className={`font-num tabular-nums ${className}`}>
      {formatMoney(value, { signed })}
    </bdi>
  )
}

const PALETTE = ['bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600']

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'size-7 text-xs' : 'size-10 text-base'
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={`${dim} shrink-0 rounded-full object-cover`} />
  }
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return (
    <span
      aria-hidden="true"
      className={`${dim} ${PALETTE[hash % PALETTE.length]} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {[...name.trim()][0] ?? '?'}
    </span>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const colors = {
    slate: 'bg-slate-800 text-slate-300',
    emerald: 'bg-emerald-950 text-emerald-300',
    amber: 'bg-amber-950 text-amber-300',
    rose: 'bg-rose-950 text-rose-300',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs ${colors[tone]}`}>{children}</span>
}
