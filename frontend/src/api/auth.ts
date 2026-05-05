import { apiClient } from './client'
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserSummary,
} from '../types/auth'

/**
 * Thin wrappers around the `/api/auth/*` endpoints. These return the
 * parsed response bodies and let axios errors propagate; callers
 * (the AuthContext, mostly) decide how to surface failures.
 *
 * The logout endpoint relies on the HttpOnly refresh cookie —
 * `withCredentials: true` is set on the shared axios instance so the
 * browser sends it automatically.
 *
 * Note: there is intentionally no `refresh()` export here. All refresh
 * calls go through `refreshSession()` in `./client.ts`, which uses a
 * bare axios instance (so it bypasses the response interceptor) and a
 * shared dedupe singleton.
 */

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', body)
  return data
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', body)
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function getMe(): Promise<UserSummary> {
  const { data } = await apiClient.get<UserSummary>('/auth/me')
  return data
}

export async function deleteMe(): Promise<void> {
  await apiClient.delete('/auth/me')
}
