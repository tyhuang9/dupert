import type { GooglePlaceSelection } from './googlePlaces'
import type { ActivityCategory } from '../types/activity'
import type { PlaceSelection } from '../types/place'

function categoryForPlace(place: GooglePlaceSelection): ActivityCategory {
  const categories = [
    place.primaryType,
    place.primaryTypeDisplayName,
    ...place.types,
  ]
    .filter((value): value is string => Boolean(value))
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

function normalizePlaceCategory(place: GooglePlaceSelection): string | null {
  return place.primaryTypeDisplayName || place.primaryType || place.types[0] || null
}

export function googlePlaceToPlaceSelection(place: GooglePlaceSelection): PlaceSelection {
  const title = place.displayName || place.formattedAddress || 'Selected place'

  return {
    businessStatus: place.businessStatus,
    category: categoryForPlace(place),
    currentOpeningHours: place.currentOpeningHours,
    title,
    mapboxId: place.id,
    placeName: place.displayName,
    address: place.formattedAddress,
    coordinatesLabel:
      place.lat !== null && place.lng !== null
        ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`
        : null,
    featureType: place.primaryType,
    lat: place.lat,
    lng: place.lng,
    googleMapsUri: place.googleMapsUri,
    photoName: place.photoName,
    photoUrl: place.photoUrl,
    placeCategory: normalizePlaceCategory(place),
    priceLevel: place.priceLevel,
    rating: place.rating,
    regularOpeningHours: place.regularOpeningHours,
    reviews: place.reviews,
    userRatingCount: place.userRatingCount,
    websiteUri: place.websiteUri,
  }
}
