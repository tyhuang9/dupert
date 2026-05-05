import axios, {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '../auth/authStore'
import type { AuthResponse } from '../types/auth'

/**
 * Single shared axios instance for every backend call.
 *
 * - `baseURL: '/api'` — Vite proxies `/api/*` to `localhost:8000` in dev;
 *   in prod the SPA and backend share an origin so the same path works.
 * - `withCredentials: true` — required so the browser sends the
 *   `refresh_token` HttpOnly cookie on `/auth/refresh` and `/auth/logout`.
 *
 * The interceptor logic below implements transparent silent-refresh on
 * 401: a single in-flight refresh promise is shared across concurrent
 * 401s so we never fire more than one refresh.
 */
export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

/** Endpoints that must NOT carry a bearer token. */
const PUBLIC_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
])

/** True when the URL points at one of the unauthenticated/cookie-only endpoints. */
function isPublicPath(url: string | undefined): boolean {
  if (!url) return false
  // Strip query string. URL may be relative (`/auth/login`) or include the
  // baseURL prefix (`/api/auth/login`) depending on the caller — normalize
  // by trimming `/api` so we can do an exact match. Suffix-matching is
  // dangerous here: `/admin/audit-auth/login` must NOT be treated public.
  const withoutQuery = url.split('?')[0]
  const path = withoutQuery.startsWith('/api')
    ? withoutQuery.slice('/api'.length)
    : withoutQuery
  return PUBLIC_PATHS.has(path)
}

/**
 * Module-scoped singleton: while a refresh is in flight, all other
 * 401s wait on the same promise instead of each kicking off their own.
 * Reset back to null when the refresh settles (success OR failure).
 */
let refreshPromise: Promise<AuthResponse> | null = null

/**
 * POSTs `/auth/refresh` via a bare `axios.post` (NOT through `apiClient`)
 * so it can never be caught by `apiClient`'s own response interceptor —
 * a 401 from refresh must surface directly to the caller, not trigger a
 * recursive refresh.
 *
 * On success, writes the new session into the auth store; on failure
 * clears the store and rethrows.
 *
 * IMPORTANT: this is the ONLY function in the frontend that should hit
 * `/api/auth/refresh`. Both the response interceptor (on 401) and the
 * `AuthProvider` mount probe go through here so refresh is funneled
 * through a single code path with a single dedupe singleton.
 *
 * Defined here (rather than in `api/auth.ts`) to avoid an import cycle:
 * `api/auth.ts` imports `apiClient` from this module, and the
 * interceptor needs the refresh primitive. Keep them split.
 */
async function performRefresh(): Promise<AuthResponse> {
  try {
    const response = await axios.post<AuthResponse>(
      '/api/auth/refresh',
      undefined,
      { withCredentials: true },
    )
    const { accessToken, expiresInSeconds, user } = response.data
    useAuthStore.getState().setSession({ accessToken, expiresInSeconds, user })
    return response.data
  } catch (err) {
    useAuthStore.getState().clearSession()
    throw err
  }
}

/**
 * Public refresh helper — dedupes concurrent refresh calls behind a
 * single in-flight promise so the response interceptor and the
 * AuthProvider mount probe never race two `/auth/refresh` requests.
 *
 * This is the only function callers should use to hit `/auth/refresh`.
 */
export function refreshSession(): Promise<AuthResponse> {
  if (refreshPromise === null) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// ---------------------------------------------------------------------------
// Request interceptor — attach Authorization header when we have a usable token.
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use((config) => {
  if (isPublicPath(config.url)) {
    return config
  }
  const token = useAuthStore.getState().getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

/**
 * Marker on the request config so we don't loop. Set after the first
 * 401 + refresh + retry; if the retried request 401s again we let it
 * propagate instead of triggering another refresh round.
 */
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// ---------------------------------------------------------------------------
// Response interceptor — single-flight silent refresh on 401, then retry once.
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined
    const status = error.response?.status

    // Only intercept 401s on requests we know about, and never retry a
    // refresh-itself failure (would loop). Public paths (login, register,
    // refresh) bubble the 401 straight to the caller.
    if (
      status !== 401 ||
      !original ||
      original._retry ||
      isPublicPath(original.url)
    ) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      await refreshSession()
    } catch {
      // refreshSession already cleared the store on failure; surface the
      // original 401 so the caller sees the shape it expects.
      return Promise.reject(error)
    }

    // Refresh succeeded — re-issue the original request with the new
    // access token. The request interceptor will pick it up again from
    // the store, but we set it explicitly here to guarantee consistency
    // even if another tab has rotated meanwhile.
    const newToken = useAuthStore.getState().getAccessToken()
    if (newToken && original.headers) {
      original.headers.set('Authorization', `Bearer ${newToken}`)
    }
    return apiClient.request(original)
  },
)

/**
 * Test-only escape hatch: reset the in-flight refresh singleton between
 * cases. Importing this from production code is a smell — keep it inside
 * the test suite.
 */
export function __resetRefreshSingletonForTests(): void {
  refreshPromise = null
}
