import { useMemo } from 'react'
import Map, { Marker, NavigationControl, type ViewState } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Activity } from '../types/activity'
import styles from './TripMap.module.css'

interface TripMapProps {
  activities: Activity[]
  destination: string | null
}

interface CoordinateActivity extends Activity {
  lat: number
  lng: number
}

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 2.7,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
}

function hasCoordinates(activity: Activity): activity is CoordinateActivity {
  return activity.lat !== null && activity.lng !== null
}

function initialViewState(activities: CoordinateActivity[]): ViewState {
  if (activities.length === 0) {
    return DEFAULT_VIEW_STATE
  }
  const lat = activities.reduce((sum, activity) => sum + activity.lat, 0) / activities.length
  const lng = activities.reduce((sum, activity) => sum + activity.lng, 0) / activities.length
  return {
    ...DEFAULT_VIEW_STATE,
    latitude: lat,
    longitude: lng,
    zoom: activities.length === 1 ? 12 : 10,
  }
}

export function TripMap({ activities, destination }: TripMapProps) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mappedActivities = useMemo(
    () => activities.filter(hasCoordinates),
    [activities],
  )
  const viewState = useMemo(
    () => initialViewState(mappedActivities),
    [mappedActivities],
  )

  if (!token) {
    return (
      <div className={styles.fallback}>
        <p>Mapbox token is not configured for this environment.</p>
      </div>
    )
  }

  return (
    <div className={styles.mapShell}>
      <Map
        mapboxAccessToken={token}
        initialViewState={viewState}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        attributionControl
        reuseMaps
        style={{ width: '100%', height: '100%', minHeight: '24rem' }}
        aria-label={destination ? `Map for ${destination}` : 'Trip map'}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {mappedActivities.map((activity, index) => (
          <Marker
            key={activity.id}
            latitude={activity.lat}
            longitude={activity.lng}
            anchor="center"
          >
            <button
              type="button"
              className={styles.marker}
              aria-label={`${index + 1}. ${activity.title}`}
              title={activity.title}
            >
              {index + 1}
            </button>
          </Marker>
        ))}
      </Map>
    </div>
  )
}
