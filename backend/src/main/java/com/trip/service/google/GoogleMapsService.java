package com.trip.service.google;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.trip.config.AppProperties;
import com.trip.repo.GoogleApiCacheRepository;

@Service
@Profile("!test")
public class GoogleMapsService {
    private static final Logger log = LoggerFactory.getLogger(GoogleMapsService.class);

    public static final String AUTOCOMPLETE_FIELD_MASK = String.join(",",
        "suggestions.placePrediction.place",
        "suggestions.placePrediction.placeId",
        "suggestions.placePrediction.text.text",
        "suggestions.placePrediction.structuredFormat.mainText.text",
        "suggestions.placePrediction.structuredFormat.secondaryText.text",
        "suggestions.placePrediction.types"
    );

    public static final String TEXT_SEARCH_FIELD_MASK = String.join(",",
        "nextPageToken",
        "places.businessStatus",
        "places.currentOpeningHours",
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.googleMapsUri",
        "places.location",
        "places.name",
        "places.photos",
        "places.primaryType",
        "places.primaryTypeDisplayName",
        "places.priceLevel",
        "places.rating",
        "places.regularOpeningHours",
        "places.types",
        "places.userRatingCount",
        "places.websiteUri"
    );

    public static final String NEARBY_SEARCH_FIELD_MASK = String.join(",",
        "places.businessStatus",
        "places.currentOpeningHours",
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.googleMapsUri",
        "places.location",
        "places.name",
        "places.photos",
        "places.primaryType",
        "places.primaryTypeDisplayName",
        "places.priceLevel",
        "places.rating",
        "places.regularOpeningHours",
        "places.types",
        "places.userRatingCount",
        "places.websiteUri"
    );

    private static final String ROUTE_FIELD_MASK = String.join(",",
        "routes.distanceMeters",
        "routes.duration",
        "routes.polyline.encodedPolyline",
        "routes.legs.distanceMeters",
        "routes.legs.duration"
    );
    private static final Set<String> AUTOCOMPLETE_REQUEST_FIELDS = Set.of(
        "input",
        "languageCode",
        "regionCode",
        "includedPrimaryTypes",
        "locationBias",
        "locationRestriction",
        "origin",
        "sessionToken"
    );
    private static final Set<String> TEXT_SEARCH_REQUEST_FIELDS = Set.of(
        "textQuery",
        "languageCode",
        "regionCode",
        "includedType",
        "locationBias",
        "locationRestriction",
        "pageSize",
        "pageToken",
        "rankPreference"
    );
    private static final Set<String> NEARBY_SEARCH_REQUEST_FIELDS = Set.of(
        "languageCode",
        "locationRestriction",
        "maxResultCount",
        "rankPreference",
        "regionCode"
    );
    private static final Set<String> LOCATION_CONSTRAINT_FIELDS = Set.of("circle", "rectangle");
    private static final Set<String> CIRCLE_FIELDS = Set.of("center", "radius");
    private static final Set<String> RECTANGLE_FIELDS = Set.of("low", "high");
    private static final Set<String> LAT_LNG_FIELDS = Set.of("latitude", "longitude");
    private static final Set<String> TEXT_SEARCH_RANK_PREFERENCES = Set.of("RELEVANCE", "DISTANCE");
    private static final Set<String> NEARBY_SEARCH_RANK_PREFERENCES = Set.of("POPULARITY", "DISTANCE");

    private final GoogleMapsClient googleClient;
    private final GoogleCacheService cacheService;
    private final ObjectMapper objectMapper;
    private final AppProperties appProperties;

    @Autowired
    public GoogleMapsService(GoogleMapsClient googleClient,
                             GoogleApiCacheRepository cacheRepository,
                             ObjectMapper objectMapper,
                             AppProperties appProperties) {
        this(googleClient, cacheRepository, objectMapper, appProperties, Clock.systemUTC());
    }

    GoogleMapsService(GoogleMapsClient googleClient,
                      GoogleApiCacheRepository cacheRepository,
                      ObjectMapper objectMapper,
                      AppProperties appProperties,
                      Clock clock) {
        this.googleClient = googleClient;
        this.cacheService = new GoogleCacheService(cacheRepository, objectMapper, clock);
        this.objectMapper = objectMapper;
        this.appProperties = appProperties;
    }

    public JsonNode autocomplete(JsonNode request) {
        ObjectNode sanitizedRequest = sanitizeAutocompleteRequest(request);
        log.info("Google Places autocomplete request");
        return googleClient.autocomplete(sanitizedRequest, AUTOCOMPLETE_FIELD_MASK);
    }

    public JsonNode textSearch(JsonNode request, boolean includePhoto) {
        ObjectNode sanitizedRequest = sanitizeTextSearchRequest(request);
        Duration ttl = appProperties.getGoogleMapsCache().getSearchTtl();
        return cacheService.cacheable("places_text_search",
            cacheRequest(sanitizedRequest, includePhoto, TEXT_SEARCH_FIELD_MASK),
            ttl,
            () -> enrichPlacesWithPhotoUrls(googleClient.textSearch(sanitizedRequest, TEXT_SEARCH_FIELD_MASK), includePhoto));
    }

    public JsonNode nearbySearch(JsonNode request, boolean includePhoto) {
        ObjectNode sanitizedRequest = sanitizeNearbySearchRequest(request);
        Duration ttl = appProperties.getGoogleMapsCache().getSearchTtl();
        return cacheService.cacheable("places_nearby_search",
            cacheRequest(sanitizedRequest, includePhoto, NEARBY_SEARCH_FIELD_MASK),
            ttl,
            () -> enrichPlacesWithPhotoUrls(googleClient.nearbySearch(sanitizedRequest, NEARBY_SEARCH_FIELD_MASK), includePhoto));
    }

    public GooglePhotoUrlResponse photoUrl(GooglePhotoUrlRequest request) {
        String photoUrl = photoUrl(
            request.photoName(),
            request.maxWidthPx() == null ? 1600 : request.maxWidthPx(),
            request.maxHeightPx() == null ? 1000 : request.maxHeightPx()
        );
        return new GooglePhotoUrlResponse(photoUrl);
    }

    public JsonNode geocode(GoogleGeocodeRequest request) {
        String address = normalizeText(request.address(), "address", 300);
        Duration ttl = appProperties.getGoogleMapsCache().getGeocodeTtl();
        return cacheService.cacheable("maps_geocode",
            new GeocodeCacheRequest(address),
            ttl,
            () -> normalizeGeocode(googleClient.geocode(address), address));
    }

    public JsonNode drivingRoute(GoogleRouteRequest request) {
        List<GoogleLatLng> coordinates = validateCoordinates(request.coordinates(), 2, 25);
        Duration ttl = appProperties.getGoogleMapsCache().getRouteTtl();
        return cacheService.cacheable("maps_driving_route",
            new RouteCacheRequest(coordinates, ROUTE_FIELD_MASK),
            ttl,
            () -> normalizeRoute(googleClient.computeRoute(buildRouteRequest(coordinates), ROUTE_FIELD_MASK)));
    }

    private JsonNode enrichPlacesWithPhotoUrls(JsonNode response, boolean includePhoto) {
        if (!includePhoto || !response.isObject()) return response;
        ObjectNode copy = response.deepCopy();
        JsonNode places = copy.get("places");
        if (!places.isArray()) return copy;
        for (JsonNode place : places) {
            if (!place.isObject()) continue;
            String photoName = firstPhotoName(place);
            String photoUrl = safePhotoUrl(photoName, 1600, 1000);
            if (photoUrl != null) {
                ((ObjectNode) place).put("photoUrl", photoUrl);
            }
        }
        return copy;
    }

    private String safePhotoUrl(String photoName, int maxWidthPx, int maxHeightPx) {
        if (photoName == null) return null;
        try {
            return photoUrl(photoName, maxWidthPx, maxHeightPx);
        } catch (GoogleMapsException ex) {
            log.warn("Google photo media resolution failed slug={}", ex.slug());
            return null;
        }
    }

    private String photoUrl(String photoName, int maxWidthPx, int maxHeightPx) {
        String normalizedPhotoName = normalizePhotoName(photoName);
        int width = boundedInt(maxWidthPx, 1, 4800, "maxWidthPx");
        int height = boundedInt(maxHeightPx, 1, 4800, "maxHeightPx");
        JsonNode media = cacheService.cacheable("places_photo_media",
            new PhotoCacheRequest(normalizedPhotoName, width, height),
            appProperties.getGoogleMapsCache().getPhotoTtl(),
            () -> googleClient.photoMedia(normalizedPhotoName, width, height));
        String photoUri = media.path("photoUri").asText("").strip();
        return isHttpsUrl(photoUri) ? photoUri : null;
    }

    private JsonNode normalizeGeocode(JsonNode raw, String fallbackLabel) {
        String status = raw.path("status").asText("").toUpperCase(Locale.ROOT);
        if ("ZERO_RESULTS".equals(status)) {
            return NullNode.instance;
        }
        if (!"OK".equals(status)) {
            if ("OVER_QUERY_LIMIT".equals(status)) {
                throw GoogleMapsException.rateLimited("Google Geocoding returned " + status);
            }
            throw GoogleMapsException.unavailable("Google Geocoding returned " + status);
        }

        JsonNode first = raw.path("results").isArray() && raw.path("results").size() > 0
            ? raw.path("results").get(0)
            : null;
        JsonNode location = first == null ? null : first.path("geometry").path("location");
        if (location == null || !location.path("lat").isNumber() || !location.path("lng").isNumber()) {
            return NullNode.instance;
        }

        ObjectNode normalized = objectMapper.createObjectNode();
        String label = first.path("formatted_address").asText("").strip();
        normalized.put("label", label.isEmpty() ? fallbackLabel : label);
        normalized.put("lat", location.path("lat").asDouble());
        normalized.put("lng", location.path("lng").asDouble());
        return normalized;
    }

    private JsonNode normalizeRoute(JsonNode raw) {
        JsonNode firstRoute = raw.path("routes").isArray() && raw.path("routes").size() > 0
            ? raw.path("routes").get(0)
            : null;
        if (firstRoute == null) {
            return NullNode.instance;
        }

        ObjectNode route = objectMapper.createObjectNode();
        ArrayNode legs = objectMapper.createArrayNode();
        long distance = firstRoute.path("distanceMeters").asLong(0);
        long duration = parseGoogleDurationSeconds(firstRoute.path("duration").asText(""));
        long fallbackDistance = 0;
        long fallbackDuration = 0;
        for (JsonNode leg : firstRoute.path("legs")) {
            long legDistance = leg.path("distanceMeters").asLong(0);
            long legDuration = parseGoogleDurationSeconds(leg.path("duration").asText(""));
            ObjectNode normalizedLeg = objectMapper.createObjectNode();
            normalizedLeg.put("distance", legDistance);
            normalizedLeg.put("duration", legDuration);
            legs.add(normalizedLeg);
            fallbackDistance += legDistance;
            fallbackDuration += legDuration;
        }

        route.put("distance", distance > 0 ? distance : fallbackDistance);
        route.put("duration", duration > 0 ? duration : fallbackDuration);
        route.set("path", decodedPolyline(firstRoute.path("polyline").path("encodedPolyline").asText("")));
        route.set("legs", legs);
        return route;
    }

    private ObjectNode buildRouteRequest(List<GoogleLatLng> coordinates) {
        ObjectNode request = objectMapper.createObjectNode();
        request.set("origin", waypoint(coordinates.get(0)));
        request.set("destination", waypoint(coordinates.get(coordinates.size() - 1)));
        if (coordinates.size() > 2) {
            ArrayNode intermediates = objectMapper.createArrayNode();
            for (GoogleLatLng coordinate : coordinates.subList(1, coordinates.size() - 1)) {
                intermediates.add(waypoint(coordinate));
            }
            request.set("intermediates", intermediates);
        }
        request.put("travelMode", "DRIVE");
        request.put("polylineQuality", "HIGH_QUALITY");
        return request;
    }

    private ObjectNode waypoint(GoogleLatLng coordinate) {
        ObjectNode latLng = objectMapper.createObjectNode();
        latLng.put("latitude", coordinate.lat());
        latLng.put("longitude", coordinate.lng());
        ObjectNode location = objectMapper.createObjectNode();
        location.set("latLng", latLng);
        ObjectNode waypoint = objectMapper.createObjectNode();
        waypoint.set("location", location);
        return waypoint;
    }

    private ArrayNode decodedPolyline(String encoded) {
        ArrayNode path = objectMapper.createArrayNode();
        if (encoded.isBlank()) return path;

        int index = 0;
        int lat = 0;
        int lng = 0;
        while (index < encoded.length()) {
            int[] latResult = decodePolylineValue(encoded, index);
            int[] lngResult = decodePolylineValue(encoded, latResult[1]);
            lat += latResult[0];
            lng += lngResult[0];
            index = lngResult[1];
            ObjectNode point = objectMapper.createObjectNode();
            point.put("lat", lat / 1E5);
            point.put("lng", lng / 1E5);
            path.add(point);
        }
        return path;
    }

    private static int[] decodePolylineValue(String encoded, int index) {
        int result = 0;
        int shift = 0;
        int currentIndex = index;
        int b;
        do {
            if (currentIndex >= encoded.length()) {
                throw GoogleMapsException.unavailable("Google Routes returned malformed polyline");
            }
            b = encoded.charAt(currentIndex++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        int delta = (result & 1) != 0 ? ~(result >> 1) : result >> 1;
        return new int[] { delta, currentIndex };
    }

    private static long parseGoogleDurationSeconds(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (!trimmed.endsWith("s")) return 0;
        try {
            return Math.max(0, Math.round(Double.parseDouble(trimmed.substring(0, trimmed.length() - 1))));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private static ObjectNode sanitizeAutocompleteRequest(JsonNode request) {
        requireObject(request, "autocomplete request");
        rejectUnknownFields(request, AUTOCOMPLETE_REQUEST_FIELDS, "autocomplete request");
        ensureOnlyOneLocationConstraint(request);

        ObjectNode sanitized = JsonNodeFactory.instance.objectNode();
        sanitized.put("input", requiredText(request, "input", 300));
        copyOptionalText(sanitized, request, "languageCode", 16);
        copyOptionalText(sanitized, request, "regionCode", 8);
        copyOptionalStringArray(sanitized, request, "includedPrimaryTypes", 5, 100);
        copyOptionalLocationConstraint(sanitized, request, "locationBias", true);
        copyOptionalLocationConstraint(sanitized, request, "locationRestriction", true);
        copyOptionalLatLng(sanitized, request, "origin");
        copyOptionalText(sanitized, request, "sessionToken", 128);
        return sanitized;
    }

    private static ObjectNode sanitizeTextSearchRequest(JsonNode request) {
        requireObject(request, "text search request");
        rejectUnknownFields(request, TEXT_SEARCH_REQUEST_FIELDS, "text search request");
        ensureOnlyOneLocationConstraint(request);

        ObjectNode sanitized = JsonNodeFactory.instance.objectNode();
        sanitized.put("textQuery", requiredText(request, "textQuery", 300));
        copyOptionalText(sanitized, request, "languageCode", 16);
        copyOptionalText(sanitized, request, "regionCode", 8);
        copyOptionalText(sanitized, request, "includedType", 100);
        copyOptionalLocationConstraint(sanitized, request, "locationBias", true);
        copyOptionalLocationConstraint(sanitized, request, "locationRestriction", true);
        copyOptionalInt(sanitized, request, "pageSize", 1, 20);
        copyOptionalText(sanitized, request, "pageToken", 512);
        copyOptionalEnum(sanitized, request, "rankPreference", TEXT_SEARCH_RANK_PREFERENCES);
        return sanitized;
    }

    private static ObjectNode sanitizeNearbySearchRequest(JsonNode request) {
        requireObject(request, "nearby search request");
        rejectUnknownFields(request, NEARBY_SEARCH_REQUEST_FIELDS, "nearby search request");

        ObjectNode sanitized = JsonNodeFactory.instance.objectNode();
        copyOptionalText(sanitized, request, "languageCode", 16);
        copyOptionalNearbyRestriction(sanitized, request);
        copyOptionalInt(sanitized, request, "maxResultCount", 1, 20);
        copyOptionalEnum(sanitized, request, "rankPreference", NEARBY_SEARCH_RANK_PREFERENCES);
        copyOptionalText(sanitized, request, "regionCode", 8);
        return sanitized;
    }

    private static List<GoogleLatLng> validateCoordinates(List<GoogleLatLng> coordinates, int min, int max) {
        if (coordinates == null || coordinates.size() < min || coordinates.size() > max) {
            throw GoogleMapsException.badRequest("Route coordinates count is out of range");
        }
        List<GoogleLatLng> normalized = new ArrayList<>(coordinates.size());
        for (GoogleLatLng coordinate : coordinates) {
            if (coordinate == null) {
                throw GoogleMapsException.badRequest("Route coordinate is required");
            }
            validateLatLng(coordinate.lat(), coordinate.lng());
            normalized.add(coordinate);
        }
        return normalized;
    }

    private static void validateLatLng(double lat, double lng) {
        if (!Double.isFinite(lat) || lat < -90 || lat > 90 || !Double.isFinite(lng) || lng < -180 || lng > 180) {
            throw GoogleMapsException.badRequest("Latitude or longitude is out of range");
        }
    }

    private static String normalizeText(String value, String field, int maxLength) {
        String normalized = value == null ? "" : value.strip();
        if (normalized.isEmpty()) {
            throw GoogleMapsException.badRequest(field + " is required");
        }
        if (normalized.length() > maxLength) {
            throw GoogleMapsException.badRequest(field + " is too long");
        }
        return normalized;
    }

    private static void requireObject(JsonNode request, String name) {
        if (request == null || !request.isObject()) {
            throw GoogleMapsException.badRequest("Google " + name + " must be a JSON object");
        }
    }

    private static void rejectUnknownFields(JsonNode request, Set<String> allowedFields, String name) {
        Iterator<String> fields = request.fieldNames();
        while (fields.hasNext()) {
            String field = fields.next();
            if (!allowedFields.contains(field)) {
                throw GoogleMapsException.badRequest("Unsupported Google " + name + " field: " + field);
            }
        }
    }

    private static void ensureOnlyOneLocationConstraint(JsonNode request) {
        if (request.hasNonNull("locationBias") && request.hasNonNull("locationRestriction")) {
            throw GoogleMapsException.badRequest("Use either locationBias or locationRestriction");
        }
    }

    private static String requiredText(JsonNode request, String field, int maxLength) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) {
            throw GoogleMapsException.badRequest(field + " is required");
        }
        if (!value.isTextual()) {
            throw GoogleMapsException.badRequest(field + " must be a string");
        }
        return normalizeText(value.asText(), field, maxLength);
    }

    private static void copyOptionalText(ObjectNode target, JsonNode request, String field, int maxLength) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        if (!value.isTextual()) {
            throw GoogleMapsException.badRequest(field + " must be a string");
        }
        String normalized = value.asText().strip();
        if (normalized.isEmpty()) return;
        if (normalized.length() > maxLength) {
            throw GoogleMapsException.badRequest(field + " is too long");
        }
        target.put(field, normalized);
    }

    private static void copyOptionalStringArray(ObjectNode target,
                                                JsonNode request,
                                                String field,
                                                int maxItems,
                                                int maxLength) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        if (!value.isArray()) {
            throw GoogleMapsException.badRequest(field + " must be an array");
        }
        if (value.size() > maxItems) {
            throw GoogleMapsException.badRequest(field + " has too many values");
        }
        ArrayNode values = JsonNodeFactory.instance.arrayNode();
        for (JsonNode item : value) {
            if (!item.isTextual()) {
                throw GoogleMapsException.badRequest(field + " values must be strings");
            }
            String normalized = item.asText().strip();
            if (normalized.isEmpty()) continue;
            if (normalized.length() > maxLength) {
                throw GoogleMapsException.badRequest(field + " value is too long");
            }
            values.add(normalized);
        }
        if (!values.isEmpty()) {
            target.set(field, values);
        }
    }

    private static void copyOptionalInt(ObjectNode target, JsonNode request, String field, int min, int max) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        if (!value.isIntegralNumber() || !value.canConvertToInt()) {
            throw GoogleMapsException.badRequest(field + " must be an integer");
        }
        target.put(field, boundedInt(value.asInt(), min, max, field));
    }

    private static void copyOptionalEnum(ObjectNode target, JsonNode request, String field, Set<String> allowedValues) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        if (!value.isTextual()) {
            throw GoogleMapsException.badRequest(field + " must be a string");
        }
        String normalized = value.asText().strip().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) return;
        if (!allowedValues.contains(normalized)) {
            throw GoogleMapsException.badRequest(field + " is unsupported");
        }
        target.put(field, normalized);
    }

    private static void copyOptionalLocationConstraint(ObjectNode target,
                                                       JsonNode request,
                                                       String field,
                                                       boolean allowRectangle) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        target.set(field, locationConstraint(value, field, allowRectangle));
    }

    private static void copyOptionalNearbyRestriction(ObjectNode target, JsonNode request) {
        JsonNode value = request.get("locationRestriction");
        if (value == null || value.isNull()) {
            throw GoogleMapsException.badRequest("Nearby search requires a circle location restriction");
        }
        target.set("locationRestriction", locationConstraint(value, "locationRestriction", false));
    }

    private static ObjectNode locationConstraint(JsonNode value, String field, boolean allowRectangle) {
        requireObject(value, field);
        rejectUnknownFields(value, LOCATION_CONSTRAINT_FIELDS, field);
        boolean hasCircle = value.hasNonNull("circle");
        boolean hasRectangle = value.hasNonNull("rectangle");
        if (hasCircle == hasRectangle) {
            throw GoogleMapsException.badRequest(field + " must contain exactly one shape");
        }
        ObjectNode constraint = JsonNodeFactory.instance.objectNode();
        if (hasCircle) {
            constraint.set("circle", circle(value.get("circle"), field + ".circle"));
            return constraint;
        }
        if (!allowRectangle) {
            throw GoogleMapsException.badRequest(field + " must be a circle");
        }
        constraint.set("rectangle", rectangle(value.get("rectangle"), field + ".rectangle"));
        return constraint;
    }

    private static ObjectNode circle(JsonNode value, String field) {
        requireObject(value, field);
        rejectUnknownFields(value, CIRCLE_FIELDS, field);
        ObjectNode circle = JsonNodeFactory.instance.objectNode();
        circle.set("center", latLng(value.get("center"), field + ".center"));
        JsonNode radiusNode = value.get("radius");
        if (radiusNode == null || radiusNode.isNull() || !radiusNode.isNumber()) {
            throw GoogleMapsException.badRequest(field + ".radius must be a number");
        }
        double radius = radiusNode.asDouble();
        if (!Double.isFinite(radius) || radius <= 0 || radius > 50_000) {
            throw GoogleMapsException.badRequest(field + ".radius is out of range");
        }
        circle.put("radius", radius);
        return circle;
    }

    private static ObjectNode rectangle(JsonNode value, String field) {
        requireObject(value, field);
        rejectUnknownFields(value, RECTANGLE_FIELDS, field);
        ObjectNode rectangle = JsonNodeFactory.instance.objectNode();
        rectangle.set("low", latLng(value.get("low"), field + ".low"));
        rectangle.set("high", latLng(value.get("high"), field + ".high"));
        return rectangle;
    }

    private static void copyOptionalLatLng(ObjectNode target, JsonNode request, String field) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) return;
        target.set(field, latLng(value, field));
    }

    private static ObjectNode latLng(JsonNode value, String field) {
        requireObject(value, field);
        rejectUnknownFields(value, LAT_LNG_FIELDS, field);
        JsonNode latitude = value.get("latitude");
        JsonNode longitude = value.get("longitude");
        if (latitude == null || longitude == null || !latitude.isNumber() || !longitude.isNumber()) {
            throw GoogleMapsException.badRequest(field + " latitude and longitude are required");
        }
        double lat = latitude.asDouble();
        double lng = longitude.asDouble();
        validateLatLng(lat, lng);
        ObjectNode latLng = JsonNodeFactory.instance.objectNode();
        latLng.put("latitude", lat);
        latLng.put("longitude", lng);
        return latLng;
    }

    private static int boundedInt(int value, int min, int max, String field) {
        if (value < min || value > max) {
            throw GoogleMapsException.badRequest(field + " is out of range");
        }
        return value;
    }

    private static String normalizePhotoName(String photoName) {
        String normalized = photoName == null ? "" : photoName.strip().replaceFirst("^/+", "");
        if (normalized.isEmpty() || !normalized.startsWith("places/")) {
            throw GoogleMapsException.badRequest("Google photo name is required");
        }
        return normalized;
    }

    private static String firstPhotoName(JsonNode place) {
        JsonNode photos = place.path("photos");
        if (!photos.isArray() || photos.isEmpty()) return null;
        String name = photos.get(0).path("name").asText("").strip();
        return name.isEmpty() ? null : name;
    }

    private static boolean isHttpsUrl(String value) {
        try {
            return URI.create(value).getScheme().equals("https");
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private static ObjectNode cacheRequest(JsonNode request, boolean includePhoto, String fieldMask) {
        ObjectNode cacheRequest = JsonNodeFactory.instance.objectNode();
        cacheRequest.set("request", request);
        cacheRequest.put("includePhoto", includePhoto);
        cacheRequest.put("fieldMask", fieldMask);
        return cacheRequest;
    }

    private record GeocodeCacheRequest(String address) {
    }

    private record RouteCacheRequest(List<GoogleLatLng> coordinates, String fieldMask) {
    }

    private record PhotoCacheRequest(String photoName, int maxWidthPx, int maxHeightPx) {
    }
}
