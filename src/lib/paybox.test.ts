import { describe, expect, it } from 'vitest'
import { parsePayBoxUrl } from './paybox'

describe('parsePayBoxUrl', () => {
  it('accepts https URLs (and trims whitespace)', () => {
    expect(parsePayBoxUrl('https://payboxapp.page.link/abc123')).toBe('https://payboxapp.page.link/abc123')
    expect(parsePayBoxUrl('  https://example.com/group  ')).toBe('https://example.com/group')
  })

  it('rejects everything that is not https', () => {
    expect(parsePayBoxUrl('http://example.com')).toBeNull()
    expect(parsePayBoxUrl('javascript:alert(1)')).toBeNull()
    expect(parsePayBoxUrl('data:text/html,<script>1</script>')).toBeNull()
    expect(parsePayBoxUrl('//example.com')).toBeNull()
    expect(parsePayBoxUrl('not a url')).toBeNull()
  })

  it('returns null when unset or empty (the link is simply hidden)', () => {
    expect(parsePayBoxUrl(undefined)).toBeNull()
    expect(parsePayBoxUrl('')).toBeNull()
    expect(parsePayBoxUrl('   ')).toBeNull()
  })
})
