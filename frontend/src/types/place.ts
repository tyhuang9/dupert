import type { CreateActivityRequest } from './activity'

export interface PlaceSelection extends Partial<CreateActivityRequest> {
  coordinatesLabel?: string | null
  featureType?: string | null
  placeCategory?: string | null
}
