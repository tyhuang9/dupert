import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { __resetRefreshSingletonForTests, apiClient } from './client'
import { useAuthStore } from '../auth/authStore'

/**
 * The interceptor calls `axios.post('/api/auth/refresh', ...)` directly
 * (a fresh axios instance, not `apiClient`) to keep the refresh path
 * out of its own retry loop. So we mount TWO adapters: one on
 * `apiClient` for the original requests, and one on the global `axios`
 * default for the refresh call.
 */
let apiMock: MockAdapter
let refreshMock: MockAdapter

const SAMPLE_USER = { id: 7, email: 'q@r.com', displayName: 'Q' }

beforeEach(() => {
  __resetRefreshSingletonForTests()
  useAuthStore.getState().clearSession()
  apiMock = new MockAdapter(apiClient)
  refreshMock = new MockAdapter(axios)
})

afterEach(() => {
  apiMock.restore()
  refreshMock.restore()
})

describe('apiClient request interceptor', () => {
  it('attaches Authorization header when a token is present', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'live-tok',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    apiMock.onGet('/probe').reply((cfg) => {
      const auth = cfg.headers?.['Authorization'] ?? cfg.headers?.['authorization']
      return [200, { ok: true, auth }]
    })

    const res = await apiClient.get('/probe')
    expect(res.data.auth).toBe('Bearer live-tok')
  })

  it('does not attach Authorization on /auth/login, /auth/register, /auth/refresh', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'live-tok',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    apiMock.onPost('/auth/login').reply((cfg) => {
      const auth = cfg.headers?.['Authorization'] ?? cfg.headers?.['authorization']
      return [200, { auth: auth ?? null }]
    })

    const { data } = await apiClient.post('/auth/login', { email: 'x', password: 'y' })
    expect(data.auth).toBeNull()
  })

  it('does NOT treat suffix matches like /admin/audit-auth/login as public (regression)', async () => {
    // The previous `path.endsWith(p)` check would have wrongly classified
    // this URL as public and stripped the bearer header. Exact-match
    // against the public path set guards against that.
    useAuthStore.getState().setSession({
      accessToken: 'live-tok',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    apiMock.onPost('/admin/audit-auth/login').reply((cfg) => {
      const auth = cfg.headers?.['Authorization'] ?? cfg.headers?.['authorization']
      return [200, { auth: auth ?? null }]
    })

    const { data } = await apiClient.post('/admin/audit-auth/login', {})
    expect(data.auth).toBe('Bearer live-tok')
  })
})

describe('apiClient response interceptor — refresh on 401', () => {
  it('on 401 calls /auth/refresh once, retries with new token, succeeds', async () => {
    // First call to /protected returns 401; the retry returns 200.
    let protectedCalls = 0
    apiMock.onGet('/protected').reply((cfg) => {
      protectedCalls += 1
      if (protectedCalls === 1) return [401, { error: 'unauthenticated' }]
      const auth = cfg.headers?.['Authorization'] ?? cfg.headers?.['authorization']
      return [200, { ok: true, auth }]
    })

    refreshMock.onPost('/api/auth/refresh').reply(200, {
      accessToken: 'rotated-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    const { data } = await apiClient.get('/protected')

    expect(protectedCalls).toBe(2)
    expect(refreshMock.history.post).toHaveLength(1)
    expect(data.auth).toBe('Bearer rotated-tok')
    expect(useAuthStore.getState().accessToken).toBe('rotated-tok')
  })

  it('clears the auth store and propagates the original 401 if refresh itself fails', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale-tok',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    apiMock.onGet('/protected').reply(401, { error: 'unauthenticated' })
    refreshMock.onPost('/api/auth/refresh').reply(401, { error: 'unauthenticated' })

    await expect(apiClient.get('/protected')).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does not retry the same request more than once (no infinite loop)', async () => {
    let protectedCalls = 0
    apiMock.onGet('/protected').reply(() => {
      protectedCalls += 1
      return [401, { error: 'unauthenticated' }]
    })

    // Refresh succeeds, but /protected keeps returning 401 — the retry must
    // give up on the second 401 instead of triggering another refresh.
    let refreshCalls = 0
    refreshMock.onPost('/api/auth/refresh').reply(() => {
      refreshCalls += 1
      return [
        200,
        {
          accessToken: 'rotated-tok',
          tokenType: 'Bearer',
          expiresInSeconds: 900,
          user: SAMPLE_USER,
        },
      ]
    })

    await expect(apiClient.get('/protected')).rejects.toMatchObject({
      response: { status: 401 },
    })

    // First attempt + one retry = 2 protected calls; refresh happens exactly once.
    expect(protectedCalls).toBe(2)
    expect(refreshCalls).toBe(1)
  })

  it('coalesces concurrent 401s into a single refresh call', async () => {
    let protectedACalls = 0
    let protectedBCalls = 0
    apiMock.onGet('/a').reply(() => {
      protectedACalls += 1
      return protectedACalls === 1 ? [401, {}] : [200, { who: 'a' }]
    })
    apiMock.onGet('/b').reply(() => {
      protectedBCalls += 1
      return protectedBCalls === 1 ? [401, {}] : [200, { who: 'b' }]
    })

    let refreshCalls = 0
    refreshMock.onPost('/api/auth/refresh').reply(() => {
      refreshCalls += 1
      return [
        200,
        {
          accessToken: 'rotated-tok',
          tokenType: 'Bearer',
          expiresInSeconds: 900,
          user: SAMPLE_USER,
        },
      ]
    })

    const [a, b] = await Promise.all([apiClient.get('/a'), apiClient.get('/b')])
    expect(a.data.who).toBe('a')
    expect(b.data.who).toBe('b')
    expect(refreshCalls).toBe(1)
  })
})
