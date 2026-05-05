import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './authContextValue'

/**
 * Hook accessor for the auth context. Lives in its own file so the
 * provider module exports only React components (keeps Fast Refresh
 * happy and avoids the `react-refresh/only-export-components` lint).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
