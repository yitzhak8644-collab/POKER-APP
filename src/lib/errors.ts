/**
 * Maps database / RPC errors to Hebrew messages.
 * The SQL layer raises stable keys (GAME_CLOSED, ZERO_SUM_MISMATCH, ...) as the error message,
 * so we match on those instead of parsing English text.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'צריך להתחבר כדי להמשיך.',
  GAME_NOT_FOUND: 'המשחק לא נמצא.',
  INVALID_JOIN_CODE: 'קוד ההצטרפות לא תקין.',
  NOT_TABLE_MANAGER: 'רק מנהל השולחן יכול לבצע את הפעולה הזו.',
  GAME_CLOSED: 'המשחק כבר נסגר ואי אפשר לשנות אותו.',
  PLAYER_NOT_FOUND: 'השחקן לא נמצא.',
  TX_NOT_FOUND: 'הרישום לא נמצא.',
  ALREADY_VOIDED: 'הרישום כבר בוטל.',
  LEDGER_IMMUTABLE: 'אי אפשר לערוך רישום. אפשר לבטל אותו ולרשום מחדש.',
  NO_PLAYERS: 'אין שחקנים במשחק.',
  INVALID_ROSTER:
    'הגדרות המארח לא תקינות: לכל היותר מארח אחד ובן/בת זוג אחד, ובן/בת זוג דורשים מארח.',
  MISSING_CASH_OUT: 'חסר Cash-out לחלק מהשחקנים.',
  ZERO_SUM_MISMATCH: 'סך ה-Cash-out לא שווה לסך הכניסות. יש לתקן לפני הסגירה.',
  INVALID_SNAPSHOT: 'סיכום המשחק לא תקין.',
  SEAT_TAKEN: 'הכיסא כבר תפוס.',
  INVALID_SEAT: 'מספר כיסא לא תקין.',
  SEAT_FORBIDDEN: 'אפשר לבחור כיסא רק לעצמך. רק מנהל השולחן יכול להושיב אחרים.',
  SUPABASE_NOT_CONFIGURED: 'האפליקציה עדיין לא מחוברת ל-Supabase.',
  tx_one_active_cash_out: 'כבר הוזן Cash-out לשחקן הזה. אפשר לבטל אותו ולהזין מחדש.',
  tx_amount_ck: 'הסכום לא תקין: Buy-in ו-Rebuy חייבים להיות חיוביים, ו-Cash-out לא יכול להיות שלילי.',
  game_players_one_host: 'כבר מוגדר מארח במשחק.',
  game_players_one_spouse: 'כבר מוגדר/ת בן/בת זוג של המארח.',
  tx_player_game_fk: 'לא ניתן להסיר שחקן שיש לו רישומים במשחק.',
  'row-level security': 'אין לך הרשאה לבצע את הפעולה הזו.',
  'permission denied': 'אין לך הרשאה לבצע את הפעולה הזו.',
}

export const NETWORK_ERROR = 'אין חיבור לרשת. נסו שוב.'
export const GENERIC_ERROR = 'משהו השתבש. נסו שוב.'

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return ''
}

/** The stable key of a known business error, or `null`. */
export function errorKey(err: unknown): string | null {
  const text = messageOf(err)
  return Object.keys(MESSAGES).find((key) => text.includes(key)) ?? null
}

export function toHebrewMessage(err: unknown): string {
  const key = errorKey(err)
  if (key !== null) return MESSAGES[key] as string
  if (/failed to fetch|network|load failed/i.test(messageOf(err))) return NETWORK_ERROR
  return GENERIC_ERROR
}
