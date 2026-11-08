import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Avatar, btnDanger, btnPrimary, btnSecondary } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import type { GamePlayerRow } from '../games/types'
import { occupantsBySeat, playerOfUser, seatPositions, unseatedPlayers } from './seats'
import { TableArt } from './TableArt'

interface Props {
  players: readonly GamePlayerRow[]
  /** The signed-in user. */
  userId: string | undefined
  /** Table manager: may seat anyone. Everybody else may only seat themselves. */
  isOwner: boolean
  /** The game is open. A closed game shows the seating read-only. */
  canWrite: boolean
  /** `seat = null` leaves the seat. */
  onSetSeat: (playerId: string, seat: number | null) => Promise<void>
}

const POSITIONS = seatPositions()

/** The table seen from above. Tap a free seat to sit; the table manager picks who sits where. */
export function SeatMap({ players, userId, isOwner, canWrite, onSetSeat }: Props) {
  const { run, busy, error, clearError } = useAction()
  const [dialogSeat, setDialogSeat] = useState<number | null>(null)
  const occupants = occupantsBySeat(players)
  const me = playerOfUser(players, userId)
  const waiting = unseatedPlayers(players)
  const dialogOccupant = dialogSeat === null ? undefined : occupants.get(dialogSeat)

  const interactive = (seat: number): boolean => {
    if (!canWrite) return false
    if (isOwner) return true
    const occupant = occupants.get(seat)
    if (me === undefined) return false
    return occupant === undefined || occupant.id === me.id
  }

  const onTap = (seat: number) => {
    clearError()
    if (isOwner || occupants.get(seat) !== undefined) {
      setDialogSeat(seat) // picker for the manager, "leave this seat?" for a player on their own seat
      return
    }
    if (me !== undefined) void run(() => onSetSeat(me.id, seat))
  }

  const set = async (playerId: string, seat: number | null) => {
    const r = await run(() => onSetSeat(playerId, seat))
    if (r.ok) setDialogSeat(null)
  }

  const closeDialog = () => {
    setDialogSeat(null)
    clearError()
  }

  return (
    <section className="space-y-3">
      <div className="relative mx-auto aspect-[300/560] w-full max-w-[17rem]">
        <TableArt occupied={occupants.size} total={POSITIONS.length} />
        {POSITIONS.map(({ seat, x, y }) => {
          const occupant = occupants.get(seat)
          const mine = occupant !== undefined && occupant.id === me?.id
          return (
            <button
              key={seat}
              type="button"
              disabled={!interactive(seat)}
              aria-label={`כיסא ${seat} · ${occupant ? occupant.display_name : 'פנוי'}`}
              onClick={() => onTap(seat)}
              // the avatar circle (40px) is centred on the seat anchor, the name hangs below it
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -20px)' }}
              className="absolute flex w-16 flex-col items-center gap-0.5 disabled:cursor-default"
            >
              {occupant ? (
                <span className={`rounded-full ${mine ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950' : ''}`}>
                  <Avatar name={occupant.display_name} src={occupant.avatar_url} />
                </span>
              ) : (
                <span className="font-num flex size-10 items-center justify-center rounded-full border-2 border-dashed border-slate-500 bg-slate-900 text-sm text-slate-300">
                  {seat}
                </span>
              )}
              <span className={`max-w-full truncate text-[11px] leading-tight ${occupant ? 'text-slate-100' : 'text-slate-500'}`}>
                {occupant ? occupant.display_name : 'פנוי'}
              </span>
            </button>
          )
        })}
      </div>

      {error !== null && (
        <p role="alert" className="text-center text-sm text-rose-400">
          {error}
        </p>
      )}
      {canWrite && !isOwner && me === undefined && (
        <p className="text-center text-sm text-slate-400">כדי לבחור כיסא צריך להיות שחקן במשחק.</p>
      )}
      {canWrite && me !== undefined && me.seat === null && !isOwner && (
        <p className="text-center text-sm text-emerald-300">בחרו כיסא פנוי כדי לשמור לעצמכם מקום.</p>
      )}
      {canWrite && isOwner && <p className="text-center text-sm text-slate-400">הקישו על כיסא כדי להושיב שם שחקן.</p>}
      {waiting.length > 0 && (
        <p className="text-center text-sm text-slate-400">
          עוד בלי כיסא: <span className="text-slate-200">{waiting.map((p) => p.display_name).join(', ')}</span>
        </p>
      )}
      {!canWrite && <p className="text-center text-sm text-slate-500">המשחק נסגר, אי אפשר לשנות כיסאות.</p>}

      <Dialog
        open={dialogSeat !== null}
        onClose={closeDialog}
        title={dialogSeat === null ? '' : `כיסא ${dialogSeat}`}
      >
        {dialogSeat !== null && !isOwner && dialogOccupant !== undefined && (
          <>
            <p className="text-slate-300">לפנות את הכיסא ולוותר על המקום שלכם?</p>
            <div className="flex gap-2">
              <button type="button" className={`${btnSecondary} flex-1`} onClick={closeDialog}>
                ביטול
              </button>
              <button type="button" className={`${btnDanger} flex-1`} disabled={busy} onClick={() => void set(dialogOccupant.id, null)}>
                פנה כיסא
              </button>
            </div>
          </>
        )}
        {dialogSeat !== null && isOwner && (
          <>
            <p className="text-sm text-slate-400">
              {dialogOccupant ? `תפוס כרגע על ידי ${dialogOccupant.display_name}.` : 'הכיסא פנוי.'} מי יושב כאן?
            </p>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {[...players]
                .sort((a, b) => Number(a.seat !== null) - Number(b.seat !== null))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`${btnSecondary} flex w-full items-center gap-3 text-start`}
                      disabled={busy || p.id === dialogOccupant?.id}
                      onClick={() => void set(p.id, dialogSeat)}
                    >
                      <Avatar name={p.display_name} src={p.avatar_url} size="sm" />
                      <span className="flex-1">{p.display_name}</span>
                      {p.seat !== null && (
                        <span className="text-xs text-slate-400">
                          {p.id === dialogOccupant?.id ? 'כבר כאן' : `יעבור מכיסא ${p.seat}`}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
            {dialogOccupant && (
              <button type="button" className={`${btnDanger} w-full`} disabled={busy} onClick={() => void set(dialogOccupant.id, null)}>
                פנה את הכיסא
              </button>
            )}
            <button type="button" className={`${btnPrimary} w-full`} onClick={closeDialog}>
              סגור
            </button>
          </>
        )}
        {error !== null && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
      </Dialog>
    </section>
  )
}
