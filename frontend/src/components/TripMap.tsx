import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapRef,
  type ViewState,
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getDrivingDirections, type DirectionsRoute } from '../api/mapboxDirections'
import { geocodeDestination, type DestinationCoordinate } from '../api/mapboxGeocode'
import type { Activity } from '../types/activity'
import styles from './TripMap.module.css'

interface TripMapProps {
  activities: Activity[]
  fallbackActivities?: Activity[]
  destination: string | null
  mapMode?: 'map' | 'satellite'
}

interface CoordinateActivity extends Activity {
  lat: number
  lng: number
}

interface DisplayStop {
  id: string
  label: string
  lat: number
  lng: number
  markerLabel: string
  source: 'selected' | 'trip' | 'destination'
  title: string
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

function sortActivitiesByTripOrder(activities: CoordinateActivity[]): CoordinateActivity[] {
  return [...activities].sort((left, right) => {
    const dayCompare = left.dayDate.localeCompare(right.dayDate)
    if (dayCompare !== 0) return dayCompare
    return left.orderIndex - right.orderIndex
  })
}

function activityToDisplayStop(
  activity: CoordinateActivity,
  index: number,
  source: 'selected' | 'trip',
): DisplayStop {
  return {
    id: `${source}-${activity.id}`,
    label: activity.title,
    lat: activity.lat,
    lng: activity.lng,
    markerLabel: String(index + 1),
    source,
    title: activity.title,
  }
}

function destinationToDisplayStop(destinationCoordinate: DestinationCoordinate): DisplayStop {
  return {
    id: 'destination',
    label: destinationCoordinate.label,
    lat: destinationCoordinate.lat,
    lng: destinationCoordinate.lng,
    markerLabel: 'D',
    source: 'destination',
    title: `Destination: ${destinationCoordinate.label}`,
  }
}

function initialViewState(stops: DisplayStop[]): ViewState {
  if (stops.length === 0) {
    return DEFAULT_VIEW_STATE
  }
  const lat = stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length
  const lng = stops.reduce((sum, stop) => sum + stop.lng, 0) / stops.length
  return {
    ...DEFAULT_VIEW_STATE,
    latitude: lat,
    longitude: lng,
    zoom: stops.length === 1 ? (stops[0].source === 'destination' ? 9 : 12) : 10,
  }
}

function formatTravelTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function TripMap({
  activities,
  fallbackActivities = [],
  destination,
  mapMode = 'map',
}: TripMapProps) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mapRef = useRef<MapRef | null>(null)
  const [directionsState, setDirectionsState] = useState<{
    error: boolean
    key: string
    route: DirectionsRoute | null
  }>({
    error: false,
    key: '',
    route: null,
  })
  const [destinationState, setDestinationState] = useState<{
    coordinate: DestinationCoordinate | null
    error: boolean
    key: string
  }>({
    coordinate: null,
    error: false,
    key: '',
  })
  const selectedMappedActivities = useMemo(
    () => activities.filter(hasCoordinates),
    [activities],
  )
  const fallbackMappedActivities = useMemo(
    () => sortActivitiesByTripOrder(fallbackActivities.filter(hasCoordinates)),
    [fallbackActivities],
  )
  const destinationKey =
    selectedMappedActivities.length === 0 && fallbackMappedActivities.length === 0
      ? destination?.trim() ?? ''
      : ''
  const destinationCoordinate =
    destinationState.key === destinationKey ? destinationState.coordinate : null
  const destinationError =
    destinationState.key === destinationKey && destinationState.error
  const destinationLoading =
    Boolean(token && destinationKey) && destinationState.key !== destinationKey
  const displayStops = useMemo(() => {
    if (selectedMappedActivities.length > 0) {
      return selectedMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'selected'),
      )
    }
    if (fallbackMappedActivities.length > 0) {
      return fallbackMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'trip'),
      )
    }
    return destinationCoordinate ? [destinationToDisplayStop(destinationCoordinate)] : []
  }, [destinationCoordinate, fallbackMappedActivities, selectedMappedActivities])
  const viewState = useMemo(
    () => initialViewState(displayStops),
    [displayStops],
  )
  const routeKey = useMemo(
    () =>
      selectedMappedActivities.map((activity) => `${activity.lng},${activity.lat}`).join(';'),
    [selectedMappedActivities],
  )
  const currentRoute = directionsState.key === routeKey ? directionsState.route : null
  const routeError = directionsState.key === routeKey && directionsState.error
  const routeLoading =
    Boolean(token) &&
    selectedMappedActivities.length >= 2 &&
    directionsState.key !== routeKey
  const mapNotice = useMemo(() => {
    if (selectedMappedActivities.length === 0 && fallbackMappedActivities.length > 0) {
      return 'No mapped stops for this day. Showing mapped stops from the full trip.'
    }
    if (selectedMappedActivities.length === 0 && destinationLoading) {
      return 'Finding trip destination...'
    }
    if (selectedMappedActivities.length === 0 && destinationCoordinate) {
      return `No mapped stops yet. Showing ${destinationCoordinate.label}.`
    }
    if (selectedMappedActivities.length === 0 && destinationKey && destinationError) {
      return 'Destination could not be mapped. Add a place to start the map.'
    }
    if (selectedMappedActivities.length === 0) {
      return 'No mapped stops yet. Add a place to start the map.'
    }
    if (selectedMappedActivities.length === 1) return 'Route needs at least two mapped stops.'
    if (routeLoading) return 'Calculating route...'
    if (routeError) return 'Route unavailable.'
    return null
  }, [
    destinationCoordinate,
    destinationError,
    destinationKey,
    destinationLoading,
    fallbackMappedActivities.length,
    routeError,
    routeLoading,
    selectedMappedActivities.length,
  ])
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
        const from = selectedMappedActivities[index]
        const to = selectedMappedActivities[index + 1]
        if (!from || !to) return []
        return [{
          id: `${from.id}-${to.id}`,
          label: formatTravelTime(leg.duration),
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        }]
      }) ?? [],
    [currentRoute, selectedMappedActivities],
  )
  const displayKey = useMemo(
    () => displayStops.map((stop) => `${stop.source}:${stop.lng},${stop.lat}`).join(';'),
    [displayStops],
  )

  useEffect(() => {
    const controller = new AbortController()
    if (!token || selectedMappedActivities.length < 2) {
      return () => controller.abort()
    }

    void getDrivingDirections(selectedMappedActivities, token, controller.signal)
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
  }, [routeKey, selectedMappedActivities, token])

  useEffect(() => {
    const controller = new AbortController()
    if (!token || !destinationKey || destinationState.key === destinationKey) {
      return () => controller.abort()
    }

    void geocodeDestination(destinationKey, token, controller.signal)
      .then((coordinate) => {
        if (controller.signal.aborted) return
        setDestinationState({
          coordinate,
          error: coordinate === null,
          key: destinationKey,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (controller.signal.aborted) return
        setDestinationState({ coordinate: null, error: true, key: destinationKey })
      })

    return () => controller.abort()
  }, [destinationKey, destinationState.key, token])

  useEffect(() => {
    const map = mapRef.current
    if (!map || displayStops.length === 0 || !displayKey) return

    if (displayStops.length === 1) {
      const [stop] = displayStops
      map.flyTo({
        center: [stop.lng, stop.lat],
        duration: 0,
        zoom: stop.source === 'destination' ? 9 : 12,
      })
      return
    }

    const lngs = displayStops.map((stop) => stop.lng)
    const lats = displayStops.map((stop) => stop.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    if (minLng === maxLng && minLat === maxLat) {
      map.flyTo({
        center: [minLng, minLat],
        duration: 0,
        zoom: 12,
      })
      return
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { duration: 0, maxZoom: 12, padding: 64 },
    )
  }, [displayKey, displayStops])

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
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={viewState}
        mapStyle={
          mapMode === 'satellite'
            ? 'mapbox://styles/mapbox/satellite-streets-v12'
            : 'mapbox://styles/mapbox/streets-v12'
        }
        attributionControl
        reuseMaps
        style={{ width: '100%', height: '100%', minHeight: '24rem' }}
        aria-label={destination ? `Map for ${destination}` : 'Trip map'}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {routeSourceData && (
          <Source id="selected-day-route-source" type="geojson" data={routeSourceData}>
            <Layer {...ROUTE_LINE_LAYER} />
          </Source>
        )}
        {displayStops.map((stop) => (
          <Marker
            key={stop.id}
            latitude={stop.lat}
            longitude={stop.lng}
            anchor="center"
          >
            {stop.source === 'destination' ? (
              <span
                className={`${styles.marker} ${styles.destinationMarker}`}
                role="img"
                aria-label={stop.title}
                title={stop.title}
              >
                {stop.markerLabel}
              </span>
            ) : (
              <span
                className={styles.marker}
                role="img"
                aria-label={`Stop ${stop.markerLabel}: ${stop.title}`}
                title={stop.title}
              >
                {stop.markerLabel}
              </span>
            )}
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
