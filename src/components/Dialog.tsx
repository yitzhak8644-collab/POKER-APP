import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  /** Called on Esc, backdrop-less dismissal and after a programmatic close. */
  onClose: () => void
  title: string
  children: ReactNode
  tone?: 'default' | 'warning' | 'danger'
}

const TONE: Record<NonNullable<DialogProps['tone']>, string> = {
  default: 'border-slate-700',
  warning: 'border-amber-500',
  danger: 'border-rose-500',
}

/** Modal built on the native <dialog> (focus trap, Esc, inert background for free). */
export function Dialog({ open, onClose, title, children, tone = 'default' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // Closing from code also fires a `close` event; only user-initiated closes (Esc) must call onClose,
  // otherwise swapping one dialog for the next would cancel the whole flow.
  const closedFromCode = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) {
      closedFromCode.current = true
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (closedFromCode.current) {
          closedFromCode.current = false
          return
        }
        onClose()
      }}
      aria-labelledby={titleId}
      className={`m-auto w-[min(92vw,26rem)] rounded-2xl border-2 bg-slate-900 p-5 text-slate-100 backdrop:bg-black/70 ${TONE[tone]}`}
    >
      {open && (
        <div className="space-y-4">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}
