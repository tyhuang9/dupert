import type { BuildTarget, DeploymentEnvironment } from './buildProfile'

export type ActualPlatform = 'web' | 'ios' | 'android'

export type AppLifecycleState = 'foreground' | 'background'

export interface PlatformCapabilities {
  appAccessGate: boolean
  appLifecycle: boolean
  browserMapsLoader: boolean
  serviceWorker: boolean
  vercelAnalytics: boolean
}

export interface PlatformRuntime {
  actualPlatform: ActualPlatform
  backendBaseUrl: string
  capabilities: Readonly<PlatformCapabilities>
  environment: DeploymentEnvironment
  target: BuildTarget
}

interface CapacitorGlobal {
  getPlatform?: () => string
}

function detectActualPlatform(): ActualPlatform {
  const reported = (globalThis as typeof globalThis & { Capacitor?: CapacitorGlobal })
    .Capacitor?.getPlatform?.()
  if (reported === 'ios' || reported === 'android') {
    return reported
  }
  return 'web'
}

const target = __DUPERT_BUILD_TARGET__
const environment = __DUPERT_DEPLOYMENT_ENVIRONMENT__

export const platformRuntime: Readonly<PlatformRuntime> = Object.freeze({
  target,
  environment,
  actualPlatform: detectActualPlatform(),
  backendBaseUrl: __DUPERT_BACKEND_BASE_URL__,
  capabilities: Object.freeze({
    appAccessGate: target === 'web',
    appLifecycle: true,
    browserMapsLoader: target === 'web',
    serviceWorker: target === 'web',
    vercelAnalytics: target === 'web' && environment === 'production',
  }),
})

/**
 * One app-lifecycle seam for browser visibility and future Capacitor foreground
 * events. Native bridges are deliberately added only after the app identity and
 * native projects exist; callers never need to scatter platform checks.
 */
export function subscribeToAppLifecycle(
  listener: (state: AppLifecycleState) => void,
): () => void {
  const emitVisibilityState = () => {
    listener(document.visibilityState === 'hidden' ? 'background' : 'foreground')
  }

  document.addEventListener('visibilitychange', emitVisibilityState)
  window.addEventListener('pageshow', emitVisibilityState)
  window.addEventListener('focus', emitVisibilityState)

  return () => {
    document.removeEventListener('visibilitychange', emitVisibilityState)
    window.removeEventListener('pageshow', emitVisibilityState)
    window.removeEventListener('focus', emitVisibilityState)
  }
}
