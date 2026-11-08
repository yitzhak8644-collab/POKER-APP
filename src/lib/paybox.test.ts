import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAYBOX_GROUP_NAME,
  DEFAULT_PAYBOX_URL,
  parsePayBoxUrl,
  resolveGroupName,
  resolvePayBoxUrl,
} from './paybox'

describe('parsePayBoxUrl', () => {
  it('accepts https URLs (and trims whitespace)', () => {
    expect(parsePayBoxUrl('https://links.payboxapp.com/abc123')).toBe('https://links.payboxapp.com/abc123')
    expect(parsePayBoxUrl('  https://example.com/group  ')).toBe('https://example.com/group')
  })

  it('rejects everything that is not https', () => {
    expect(parsePayBoxUrl('http://example.com')).toBeNull()
    expect(parsePayBoxUrl('javascript:alert(1)')).toBeNull()
    expect(parsePayBoxUrl('data:text/html,<script>1</script>')).toBeNull()
    expect(parsePayBoxUrl('//example.com')).toBeNull()
    expect(parsePayBoxUrl('not a url')).toBeNull()
  })

  it('returns null when unset or empty', () => {
    expect(parsePayBoxUrl(undefined)).toBeNull()
    expect(parsePayBoxUrl('')).toBeNull()
    expect(parsePayBoxUrl('   ')).toBeNull()
  })
})

describe('resolvePayBoxUrl', () => {
  it('the built-in default is the group invite and is a valid https link', () => {
    expect(DEFAULT_PAYBOX_URL).toBe('https://links.payboxapp.com/6jbgpvhOgYb')
    expect(parsePayBoxUrl(DEFAULT_PAYBOX_URL)).toBe(DEFAULT_PAYBOX_URL)
  })

  it('uses the default when there is no override', () => {
    expect(resolvePayBoxUrl(undefined)).toBe(DEFAULT_PAYBOX_URL)
    expect(resolvePayBoxUrl('')).toBe(DEFAULT_PAYBOX_URL)
  })

  it('a valid https override wins', () => {
    expect(resolvePayBoxUrl('https://links.payboxapp.com/other')).toBe('https://links.payboxapp.com/other')
  })

  it('an unsafe or malformed override never replaces the link (falls back to the default)', () => {
    expect(resolvePayBoxUrl('javascript:alert(1)')).toBe(DEFAULT_PAYBOX_URL)
    expect(resolvePayBoxUrl('http://evil.example')).toBe(DEFAULT_PAYBOX_URL)
    expect(resolvePayBoxUrl('garbage')).toBe(DEFAULT_PAYBOX_URL)
  })
})

describe('resolveGroupName', () => {
  it('defaults to the group name and accepts a trimmed override', () => {
    expect(DEFAULT_PAYBOX_GROUP_NAME).toBe('ועד P שלוחות')
    expect(resolveGroupName(undefined)).toBe(DEFAULT_PAYBOX_GROUP_NAME)
    expect(resolveGroupName('   ')).toBe(DEFAULT_PAYBOX_GROUP_NAME)
    expect(resolveGroupName(' חברים ')).toBe('חברים')
  })
})
