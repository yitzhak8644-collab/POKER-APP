import type { FeeError, Role, TxType } from '../../lib/finance'

export const ROLE_LABEL: Record<Role, string> = {
  guest: 'אורח',
  host: 'מארח',
  host_spouse: 'בן/בת זוג',
}

export const TX_LABEL: Record<TxType, string> = {
  buy_in: 'Buy-in',
  rebuy: 'Rebuy',
  cash_out: 'Cash-out',
}

export const FEE_ERROR_TEXT: Record<FeeError, string> = {
  NO_PLAYERS: 'אין שחקנים במשחק.',
  MULTIPLE_HOSTS: 'יש יותר ממארח אחד. אפשר להגדיר רק מארח אחד.',
  MULTIPLE_SPOUSES: 'יש יותר מבן/בת זוג אחד/ת למארח.',
  SPOUSE_WITHOUT_HOST: 'מוגדר/ת בן/בת זוג בלי מארח. הגדירו מארח, או בטלו את תפקיד בן/בת הזוג (משחק במקום ניטרלי).',
}
