import { APIProvider } from '@vis.gl/react-google-maps'
import type { PropsWithChildren } from 'react'
import { googleMapsApiKey } from '../utils/googleMapsAccess'

const GOOGLE_MAPS_LIBRARIES = ['places', 'geocoding', 'routes'] as const

export function GoogleMapsProvider({ children }: PropsWithChildren) {
  const apiKey = googleMapsApiKey()

  if (!apiKey) {
    return <>{children}</>
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={[...GOOGLE_MAPS_LIBRARIES]}
      authReferrerPolicy="origin"
    >
      {children}
    </APIProvider>
  )
}
