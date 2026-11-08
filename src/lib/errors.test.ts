import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { errorKey, GENERIC_ERROR, NETWORK_ERROR, toHebrewMessage } from './errors'

describe('toHebrewMessage', () => {
  it('maps a Postgrest-style business error by its stable key', () => {
    expect(toHebrewMessage({ message: 'GAME_CLOSED', code: 'PT409' })).toBe(
      'המשחק כבר נסגר ואי אפשר לשנות אותו.',
    )
    expect(errorKey({ message: 'ZERO_SUM_MISMATCH' })).toBe('ZERO_SUM_MISMATCH')
  })

  it('maps constraint and RLS errors', () => {
    expect(
      toHebrewMessage({
        message: 'duplicate key value violates unique constraint "tx_one_active_cash_out"',
      }),
    ).toMatch(/Cash-out/)
    expect(toHebrewMessage({ message: 'new row violates row-level security policy for table "transactions"' })).toMatch(
      /הרשאה/,
    )
    expect(toHebrewMessage(new Error('permission denied for table games'))).toMatch(/הרשאה/)
  })

  it('accepts plain strings', () => {
    expect(toHebrewMessage('NOT_TABLE_MANAGER')).toMatch(/מנהל השולחן/)
  })

  it('recognises network failures', () => {
    expect(toHebrewMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_ERROR)
  })

  it('falls back to a generic message', () => {
    expect(toHebrewMessage(new Error('boom'))).toBe(GENERIC_ERROR)
    expect(toHebrewMessage(null)).toBe(GENERIC_ERROR)
    expect(toHebrewMessage(42)).toBe(GENERIC_ERROR)
    expect(errorKey({})).toBeNull()
  })

  it('has a Hebrew message for every error key the SQL layer can raise', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8')
    const keys = [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1] as string)
    expect(keys.length).toBeGreaterThan(10)
    for (const key of new Set(keys)) {
      expect(errorKey({ message: key }), `missing message for ${key}`).toBe(key)
    }
  })
})
