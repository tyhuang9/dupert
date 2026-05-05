import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  ACCESS_TOKEN_EXPIRY_SKEW_MS,
  useAuthStore,
  useIsAuthenticated,
} from './authStore'

const sampleUser = { id: 1, email: 'a@b.com', displayName: 'A' }

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setSession populates fields and computes expiresAt from current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))

    useAuthStore.getState().setSession({
      accessToken: 'tok-1',
      expiresInSeconds: 900,
      user: sampleUser,
    })

    const s = useAuthStore.getState()
    expect(s.accessToken).toBe('tok-1')
    expect(s.user).toEqual(sampleUser)
    expect(s.expiresAt).toBe(Date.now() + 900_000)
  })

  it('clearSession nulls every field', () => {
    useAuthStore.getState().setSession({
      accessToken: 'tok-1',
      expiresInSeconds: 900,
      user: sampleUser,
    })
    useAuthStore.getState().clearSession()
    const s = useAuthStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.expiresAt).toBeNull()
  })

  it('getAccessToken returns the token while live', () => {
    useAuthStore.getState().setSession({
      accessToken: 'tok-live',
      expiresInSeconds: 900,
      user: sampleUser,
    })
    expect(useAuthStore.getState().getAccessToken()).toBe('tok-live')
  })

  it('getAccessToken returns null past expiry (with skew)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))

    useAuthStore.getState().setSession({
      accessToken: 'tok-near-expiry',
      expiresInSeconds: 60,
      user: sampleUser,
    })

    // Advance into the skew window (60s TTL - 30s skew = 30s before expiry).
    vi.setSystemTime(Date.now() + 31_000)
    expect(useAuthStore.getState().getAccessToken()).toBeNull()
  })

  it('getAccessToken returns null when there is no session', () => {
    expect(useAuthStore.getState().getAccessToken()).toBeNull()
  })

  it('skew window is at least 30 seconds (sanity check on the constant)', () => {
    expect(ACCESS_TOKEN_EXPIRY_SKEW_MS).toBeGreaterThanOrEqual(30_000)
  })

  it('useIsAuthenticated returns false inside the expiry skew window', () => {
    // 20s TTL is inside the 30s skew window: getAccessToken() would
    // already return null, so useIsAuthenticated must not claim
    // authenticated and let consumers (e.g. <RequireAuth>) skew from
    // the request layer.
    useAuthStore.getState().setSession({
      accessToken: 'tok-skewed',
      expiresInSeconds: 20,
      user: sampleUser,
    })

    const { result } = renderHook(() => useIsAuthenticated())
    expect(result.current).toBe(false)
    expect(useAuthStore.getState().getAccessToken()).toBeNull()
  })

  it('useIsAuthenticated returns true for a freshly issued token', () => {
    useAuthStore.getState().setSession({
      accessToken: 'tok-live',
      expiresInSeconds: 900,
      user: sampleUser,
    })
    const { result } = renderHook(() => useIsAuthenticated())
    expect(result.current).toBe(true)
  })
})
