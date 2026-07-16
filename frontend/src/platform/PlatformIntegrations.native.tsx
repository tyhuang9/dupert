import type { PropsWithChildren } from 'react'

/** Native builds intentionally omit browser access-gate and analytics code. */
export function PlatformIntegrations({ children }: PropsWithChildren) {
  return <>{children}</>
}
