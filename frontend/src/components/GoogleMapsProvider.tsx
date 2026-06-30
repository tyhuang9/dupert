import { APIProvider } from '@vis.gl/react-google-maps'
import type { PropsWithChildren } from 'react'
import { googleMapsBrowserApiKey } from '../utils/googleMapsAccess'

export function GoogleMapsProvider({ children }: PropsWithChildren) {
  const apiKey = googleMapsBrowserApiKey()

  if (!apiKey) {
    return <>{children}</>
  }

  return (
    <APIProvider apiKey={apiKey} authReferrerPolicy="origin">
      {children}
    </APIProvider>
  )
}
