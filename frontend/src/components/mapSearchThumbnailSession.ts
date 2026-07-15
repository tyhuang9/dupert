import { imageUrlFromGooglePhotoName } from './googlePlaces'

const MAX_CONCURRENT_THUMBNAIL_REQUESTS = 4

export interface MapSearchThumbnailSession {
  load: (photoName: string) => Promise<string | null>
  markMissing: (photoName: string) => void
}

export function createMapSearchThumbnailSession(
  resolvePhotoUrl = imageUrlFromGooglePhotoName,
): MapSearchThumbnailSession {
  const cache = new Map<string, Promise<string | null>>()
  const queue: Array<{
    photoName: string
    resolve: (url: string | null) => void
  }> = []
  let activeRequests = 0

  const pumpQueue = () => {
    while (activeRequests < MAX_CONCURRENT_THUMBNAIL_REQUESTS && queue.length > 0) {
      const next = queue.shift()
      if (!next) continue
      activeRequests += 1
      void resolvePhotoUrl({
        maxHeightPx: 240,
        maxWidthPx: 320,
        photoName: next.photoName,
      }).catch(() => null).then(next.resolve).finally(() => {
        activeRequests -= 1
        pumpQueue()
      })
    }
  }

  return {
    load(photoName) {
      const cached = cache.get(photoName)
      if (cached) return cached
      const pending = new Promise<string | null>((resolve) => {
        queue.push({ photoName, resolve })
        pumpQueue()
      })
      cache.set(photoName, pending)
      return pending
    },
    markMissing(photoName) {
      cache.set(photoName, Promise.resolve(null))
    },
  }
}
