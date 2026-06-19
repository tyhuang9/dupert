import { useState } from 'react'
import { SearchBox } from '@mapbox/search-js-react'
import type { SearchBoxRetrieveResponse } from '@mapbox/search-js-core'
import type { ActivityCategory, CreateActivityRequest } from '../types/activity'
import styles from './PlaceSearch.module.css'

interface PlaceSearchProps {
  onPlaceSelect: (place: Partial<CreateActivityRequest>) => void
}

type RetrievedFeature = SearchBoxRetrieveResponse['features'][number]

function categoryForPlace(properties: RetrievedFeature['properties']): ActivityCategory {
  const categories = [
    ...(properties.poi_category ?? []),
    properties.maki,
    properties.feature_type,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase())

  if (categories.some((value) => /restaurant|food|cafe|bar|bakery|meal/.test(value))) {
    return 'MEAL'
  }
  if (categories.some((value) => /hotel|lodging|motel|hostel/.test(value))) {
    return 'LODGING'
  }
  if (categories.some((value) => /airport|station|transit|parking|car|rail/.test(value))) {
    return 'TRANSPORT'
  }
  return 'ACTIVITY'
}

function placePayload(res: SearchBoxRetrieveResponse): Partial<CreateActivityRequest> | null {
  const feature = res.features[0]
  if (!feature) return null
  const [lng, lat] = feature.geometry.coordinates
  const properties = feature.properties
  const title = properties.name_preferred || properties.name
  const address =
    properties.full_address ||
    properties.address ||
    properties.place_formatted ||
    null

  return {
    category: categoryForPlace(properties),
    title,
    mapboxId: properties.mapbox_id,
    placeName: title,
    address,
    lat,
    lng,
  }
}

export function PlaceSearch({ onPlaceSelect }: PlaceSearchProps) {
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const [value, setValue] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)

  if (!accessToken) {
    return (
      <div className={styles.fallback}>
        Mapbox token is not configured for place search.
      </div>
    )
  }

  return (
    <div className={styles.searchShell}>
      <label className={styles.label}>
        Place search
        <span className={styles.searchBox}>
          <SearchBox
            accessToken={accessToken}
            value={value}
            onChange={setValue}
            onRetrieve={(res) => {
              const payload = placePayload(res)
              if (!payload) return
              setSelectedName(payload.placeName ?? payload.title ?? '')
              setSelectedAddress(payload.address ?? null)
              onPlaceSelect(payload)
            }}
            placeholder="Search restaurants, sights, hotels..."
            options={{ language: 'en' }}
          />
        </span>
      </label>
      {selectedName && (
        <div className={styles.selectedPlace}>
          <p>{selectedName}</p>
          {selectedAddress && (
            <p className={styles.placeAddress}>{selectedAddress}</p>
          )}
        </div>
      )}
    </div>
  )
}
