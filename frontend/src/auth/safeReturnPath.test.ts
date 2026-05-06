import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './safeReturnPath'

describe('safeReturnPath', () => {
  it('returns the fallback when given null', () => {
    expect(safeReturnPath(null)).toBe('/trips')
  })

  it('returns the fallback for an empty string', () => {
    expect(safeReturnPath('')).toBe('/trips')
  })

  it('returns the input for a clean relative path', () => {
    expect(safeReturnPath('/trips')).toBe('/trips')
  })

  it('returns the fallback for protocol-relative URLs', () => {
    expect(safeReturnPath('//evil.com')).toBe('/trips')
  })

  it('returns the fallback for absolute http URLs', () => {
    expect(safeReturnPath('http://evil.example')).toBe('/trips')
  })

  it('returns the fallback for absolute https URLs', () => {
    expect(safeReturnPath('https://evil.example')).toBe('/trips')
  })

  it('returns the fallback for paths without a leading slash', () => {
    expect(safeReturnPath('foo')).toBe('/trips')
  })

  it('preserves the query string on a relative path', () => {
    expect(safeReturnPath('/trips?day=1')).toBe('/trips?day=1')
  })
})
