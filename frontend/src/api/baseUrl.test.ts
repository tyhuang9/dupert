import { describe, expect, it } from 'vitest'
import {
  buildApiUrl,
  normalizeBackendApiBaseUrl,
  normalizeBackendBaseUrl,
} from './baseUrl'

describe('backend API base URL', () => {
  it('defaults to a same-origin backend with the /api prefix', () => {
    expect(normalizeBackendBaseUrl(undefined)).toBe('')
    expect(normalizeBackendBaseUrl('   ')).toBe('')
    expect(normalizeBackendApiBaseUrl(undefined)).toBe('/api')
    expect(normalizeBackendApiBaseUrl('   ')).toBe('/api')
  })

  it('treats VITE_BACKEND_API_URL as the backend origin and appends /api', () => {
    expect(normalizeBackendBaseUrl('https://backend.example.com')).toBe(
      'https://backend.example.com',
    )
    expect(normalizeBackendApiBaseUrl('https://backend.example.com')).toBe(
      'https://backend.example.com/api',
    )
  })

  it('removes trailing slashes from configured backend origins', () => {
    expect(normalizeBackendBaseUrl('https://backend.example.com/')).toBe(
      'https://backend.example.com',
    )
    expect(normalizeBackendApiBaseUrl('https://backend.example.com/')).toBe(
      'https://backend.example.com/api',
    )
  })

  it('accepts legacy values that already include the /api prefix', () => {
    expect(normalizeBackendBaseUrl('https://backend.example.com/api/')).toBe(
      'https://backend.example.com',
    )
    expect(normalizeBackendApiBaseUrl('https://backend.example.com/api/')).toBe(
      'https://backend.example.com/api',
    )
    expect(normalizeBackendBaseUrl('/api')).toBe('')
    expect(normalizeBackendApiBaseUrl('/api')).toBe('/api')
  })

  it('supports relative backend base prefixes', () => {
    expect(normalizeBackendBaseUrl('backend-proxy/')).toBe('/backend-proxy')
    expect(normalizeBackendApiBaseUrl('backend-proxy/')).toBe('/backend-proxy/api')
  })

  it('builds same-origin API URLs with query strings', () => {
    expect(buildApiUrl('/trips/abc/stream', { includeDrafts: true })).toBe(
      '/api/trips/abc/stream?includeDrafts=true',
    )
  })
})
