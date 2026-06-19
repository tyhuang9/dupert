import { useEffect, useMemo, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type ViewState,
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getDrivingDirections, type DirectionsRoute } from '../api/mapboxDirections'
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

const ROUTE_LINE_LAYER: LayerProps = {
  id: 'selected-day-route',
  type: 'line',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#2563eb',
    'line-width': 4,
    'line-opacity': 0.82,
  },
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

function formatTravelTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function TripMap({ activities, destination }: TripMapProps) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const [directionsState, setDirectionsState] = useState<{
    error: boolean
    key: string
    route: DirectionsRoute | null
  }>({
    error: false,
    key: '',
    route: null,
  })
  const mappedActivities = useMemo(
    () => activities.filter(hasCoordinates),
    [activities],
  )
  const viewState = useMemo(
    () => initialViewState(mappedActivities),
    [mappedActivities],
  )
  const routeKey = useMemo(
    () => mappedActivities.map((activity) => `${activity.lng},${activity.lat}`).join(';'),
    [mappedActivities],
  )
  const currentRoute = directionsState.key === routeKey ? directionsState.route : null
  const routeError = directionsState.key === routeKey && directionsState.error
  const routeLoading =
    Boolean(token) &&
    mappedActivities.length >= 2 &&
    directionsState.key !== routeKey
  const mapNotice = useMemo(() => {
    if (mappedActivities.length === 0) return 'No mapped stops for this day.'
    if (mappedActivities.length === 1) return 'Route needs at least two mapped stops.'
    if (routeLoading) return 'Calculating route...'
    if (routeError) return 'Route unavailable.'
    return null
  }, [mappedActivities.length, routeError, routeLoading])
  const routeSourceData = useMemo(
    () =>
      currentRoute
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: currentRoute.geometry,
          }
        : null,
    [currentRoute],
  )
  const routeLegMarkers = useMemo(
    () =>
      currentRoute?.legs.flatMap((leg, index) => {
        const from = mappedActivities[index]
        const to = mappedActivities[index + 1]
        if (!from || !to) return []
        return [{
          id: `${from.id}-${to.id}`,
          label: formatTravelTime(leg.duration),
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        }]
      }) ?? [],
    [currentRoute, mappedActivities],
  )

  useEffect(() => {
    const controller = new AbortController()
    if (!token || mappedActivities.length < 2) {
      return () => controller.abort()
    }

    void getDrivingDirections(mappedActivities, token, controller.signal)
      .then((nextRoute) => {
        if (controller.signal.aborted) return
        setDirectionsState({ error: false, key: routeKey, route: nextRoute })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (controller.signal.aborted) return
        setDirectionsState({ error: true, key: routeKey, route: null })
      })

    return () => controller.abort()
  }, [mappedActivities, routeKey, token])

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
        {routeSourceData && (
          <Source id="selected-day-route-source" type="geojson" data={routeSourceData}>
            <Layer {...ROUTE_LINE_LAYER} />
          </Source>
        )}
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
        {routeLegMarkers.map((leg) => (
          <Marker
            key={leg.id}
            latitude={leg.lat}
            longitude={leg.lng}
            anchor="center"
          >
            <span className={styles.durationMarker}>{leg.label}</span>
          </Marker>
        ))}
      </Map>
      {mapNotice && (
        <div className={styles.mapNotice} aria-live="polite">
          {mapNotice}
        </div>
      )}
      {currentRoute && (
        <div className={styles.routeSummary} aria-live="polite">
          <span>
            {formatTravelTime(currentRoute.duration)} total · {(currentRoute.distance / 1000).toFixed(1)} km
          </span>
        </div>
      )}
    </div>
  )
}
