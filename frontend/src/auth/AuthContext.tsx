import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as authApi from '../api/auth'
import { refreshSession } from '../api/client'
import { useAuthStore, useIsAuthenticated, useUser } from './authStore'
import { AuthContext, type AuthContextValue } from './authContextValue'
import type { LoginRequest, RegisterRequest } from '../types/auth'

interface AuthProviderProps {
  children: ReactNode
}

const PROACTIVE_REFRESH_LEAD_MS = 60_000

function shouldRefreshSessionSoon(expiresAt: number): boolean {
  return Date.now() >= expiresAt - PROACTIVE_REFRESH_LEAD_MS
}

/**
 * Wraps the app and exposes the auth API. On first mount, attempts a
 * silent `/auth/refresh` — the refresh cookie may exist from a prior
 * session and the user expects to stay logged in across reloads. If
 * refresh fails the user simply lands logged-out; the failure is not
 * surfaced because "no prior session" looks identical to "expired".
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const user = useUser()
  const isAuthenticated = useIsAuthenticated()
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)
  const clearSession = useAuthStore((s) => s.clearSession)

  // Skip the probe (and the initializing-window) if a session was
  // pre-seeded — e.g. tests, or a hypothetical SSR rehydration. Reading
  // the store synchronously in the lazy initializer is safe and keeps us
  // off the "set state synchronously inside an effect" lint.
  const [isInitializing, setIsInitializing] = useState<boolean>(
    () => useAuthStore.getState().accessToken === null,
  )
  // Guard against StrictMode double-invoke: useEffect runs twice in dev,
  // we don't want two refresh probes on cold start. `probedRef` blocks
  // the second run; `cancelledRef` is shared across both runs so that
  // the synthetic StrictMode cleanup (which runs between the two
  // invocations) doesn't poison the in-flight promise's state updates.
  const probedRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (probedRef.current) return
    probedRef.current = true

    if (useAuthStore.getState().accessToken !== null) {
      // Session was pre-seeded; nothing to probe. `isInitializing` was
      // already initialized to false in that case.
      return
    }

    // `refreshSession()` is the single funnel for `/auth/refresh` calls
    // — same code path the response interceptor uses on 401, deduped by
    // a shared in-flight singleton. It already writes into the auth
    // store, but we re-invoke `setSession` here so the provider's mount
    // probe owns the visible state transition for testability.
    refreshSession()
      .then((res) => {
        if (cancelledRef.current) return
        setSession({
          accessToken: res.accessToken,
          expiresInSeconds: res.expiresInSeconds,
          user: res.user,
        })
      })
      .catch(() => {
        // No prior session, expired cookie, or revoked chain — all the
        // same outcome from the user's perspective.
      })
      .finally(() => {
        if (!cancelledRef.current) setIsInitializing(false)
      })
  }, [setSession])

  // Real-unmount guard: flip cancel only on a true unmount. StrictMode
  // dev double-invokes ALL effects (mount → cleanup → mount); resetting
  // `cancelledRef.current` to `false` at the top of each setup ensures
  // the synthetic mid-mount cleanup doesn't permanently poison the
  // in-flight probe. On real unmount the body never re-runs, so the
  // flag stays true and the dangling promise's state updates short-circuit.
  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    if (user === null || expiresAt === null) {
      return
    }

    const refreshIfDue = () => {
      if (!shouldRefreshSessionSoon(expiresAt)) {
        return
      }
      refreshSession().catch(() => {
        // refreshSession clears local auth state on failure.
      })
    }
    const refreshDelayMs = Math.max(
      0,
      expiresAt - Date.now() - PROACTIVE_REFRESH_LEAD_MS,
    )
    const refreshTimer = window.setTimeout(refreshIfDue, refreshDelayMs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfDue()
      }
    }

    window.addEventListener('focus', refreshIfDue)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (document.visibilityState === 'visible') {
      refreshIfDue()
    }

    return () => {
      window.clearTimeout(refreshTimer)
      window.removeEventListener('focus', refreshIfDue)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [expiresAt, user])

  const login = useCallback(
    async (body: LoginRequest) => {
      const res = await authApi.login(body)
      setSession({
        accessToken: res.accessToken,
        expiresInSeconds: res.expiresInSeconds,
        user: res.user,
      })
      return res.user
    },
    [setSession],
  )

  const register = useCallback(
    async (body: RegisterRequest) => {
      return authApi.register(body)
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Always clear local state, even if the network call fails — a
      // user who clicks "log out" must end up logged out from this tab
      // regardless of server reachability.
    } finally {
      clearSession()
    }
  }, [clearSession])

  const updateProfile = useCallback(
    async (body: { displayName: string }) => {
      const updatedUser = await authApi.updateProfile(body)
      setUser(updatedUser)
      return updatedUser
    },
    [setUser],
  )

  const changePassword = useCallback(
    async (body: { currentPassword: string; newPassword: string }) => {
      await authApi.changePassword(body)
    },
    [],
  )

  const requestPasswordReset = useCallback(
    async (body: { email: string }) => {
      await authApi.requestPasswordReset(body)
    },
    [],
  )

  const deleteAccount = useCallback(async () => {
    await authApi.deleteMe()
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isInitializing,
      login,
      register,
      updateProfile,
      changePassword,
      requestPasswordReset,
      logout,
      deleteAccount,
    }),
    [
      user,
      isAuthenticated,
      isInitializing,
      login,
      register,
      updateProfile,
      changePassword,
      requestPasswordReset,
      logout,
      deleteAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
