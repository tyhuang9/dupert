import type { TripMapProps } from './TripMap'

/**
 * A deliberately explicit native placeholder until the #66 renderer spike
 * selects a production map implementation. Keeping it target-specific makes
 * browser Maps code and its public browser key absent from native bundles.
 */
export function TripMapSurface(props: TripMapProps) {
  // Keep the target-specific contract aligned with the web renderer while #66
  // determines which native map adapter can consume these inputs safely.
  void props

  return (
    <section
      aria-labelledby="native-map-unavailable-heading"
      data-testid="native-map-unavailable"
      style={{ display: 'grid', minHeight: '16rem', padding: '1.5rem', placeItems: 'center', textAlign: 'center' }}
    >
      <div>
        <h2 id="native-map-unavailable-heading">Map unavailable in this native evaluation build</h2>
        <p>Use the itinerary to review and edit the trip while native Maps feasibility is evaluated.</p>
      </div>
    </section>
  )
}
