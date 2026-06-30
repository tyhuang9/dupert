package com.trip.service.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;
import com.trip.domain.GoogleApiCache;
import com.trip.repo.GoogleApiCacheRepository;

class GoogleMapsServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-30T12:00:00Z"), ZoneOffset.UTC);
    private final AppProperties appProperties = new AppProperties();

    @Mock
    private GoogleMapsClient googleClient;

    @Mock
    private GoogleApiCacheRepository cacheRepository;

    private AutoCloseable mocks;
    private GoogleMapsService service;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        service = new GoogleMapsService(googleClient, cacheRepository, objectMapper, appProperties, clock);
    }

    @AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    @Test
    void autocompleteSanitizesRequestBeforeCallingGoogle() {
        JsonNode request = json("""
            {
              "input": " pizza ",
              "languageCode": " en ",
              "regionCode": " us ",
              "includedPrimaryTypes": ["restaurant", " "],
              "locationBias": {
                "circle": {
                  "center": { "latitude": 41.0, "longitude": -87.0 },
                  "radius": 2500
                }
              },
              "origin": { "latitude": 41.1, "longitude": -87.1 },
              "sessionToken": " session-123 "
            }
            """);
        when(googleClient.autocomplete(any(), eq(GoogleMapsService.AUTOCOMPLETE_FIELD_MASK)))
            .thenReturn(json("{\"suggestions\":[]}"));

        service.autocomplete(request);

        ArgumentCaptor<JsonNode> googleRequest = ArgumentCaptor.forClass(JsonNode.class);
        verify(googleClient).autocomplete(googleRequest.capture(), eq(GoogleMapsService.AUTOCOMPLETE_FIELD_MASK));
        JsonNode sanitized = googleRequest.getValue();
        assertThat(sanitized.path("input").asText()).isEqualTo("pizza");
        assertThat(sanitized.path("languageCode").asText()).isEqualTo("en");
        assertThat(sanitized.path("regionCode").asText()).isEqualTo("us");
        assertThat(sanitized.path("includedPrimaryTypes")).hasSize(1);
        assertThat(sanitized.path("includedPrimaryTypes").get(0).asText()).isEqualTo("restaurant");
        assertThat(sanitized.path("locationBias").path("circle").path("radius").asDouble()).isEqualTo(2500.0);
        assertThat(sanitized.path("origin").path("latitude").asDouble()).isEqualTo(41.1);
        assertThat(sanitized.path("sessionToken").asText()).isEqualTo("session-123");
    }

    @Test
    void textSearchCacheMissCallsGoogleWithFieldMaskAndCachesPhotoUrl() {
        JsonNode request = json("{\"textQuery\":\"pizza\",\"pageSize\":1}");
        JsonNode googleResponse = json("""
            {
              "places": [
                {
                  "id": "place-1",
                  "displayName": { "text": "Pizza" },
                  "photos": [{ "name": "places/place-1/photos/photo-1" }]
                }
              ]
            }
            """);
        when(cacheRepository.findById(any())).thenReturn(Optional.empty());
        when(googleClient.textSearch(request, GoogleMapsService.TEXT_SEARCH_FIELD_MASK)).thenReturn(googleResponse);
        when(googleClient.photoMedia("places/place-1/photos/photo-1", 1600, 1000))
            .thenReturn(json("{\"photoUri\":\"https://lh3.example.com/photo.jpg\"}"));

        JsonNode response = service.textSearch(request, true);

        assertThat(response.path("places").get(0).path("photoUrl").asText())
            .isEqualTo("https://lh3.example.com/photo.jpg");
        verify(googleClient).textSearch(request, GoogleMapsService.TEXT_SEARCH_FIELD_MASK);
        verify(googleClient).photoMedia("places/place-1/photos/photo-1", 1600, 1000);
        ArgumentCaptor<GoogleApiCache> saved = ArgumentCaptor.forClass(GoogleApiCache.class);
        verify(cacheRepository, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).hasSize(2);
        assertThat(saved.getAllValues()).anySatisfy(row ->
            assertThat(row.getId().getCacheName()).isEqualTo("places_text_search"));
        assertThat(saved.getAllValues()).anySatisfy(row ->
            assertThat(row.getId().getCacheName()).isEqualTo("places_photo_media"));
    }

    @Test
    void textSearchRejectsUnsupportedFieldsBeforeCallingGoogle() {
        JsonNode request = json("{\"textQuery\":\"pizza\",\"apiKey\":\"client-key\"}");

        assertThatThrownBy(() -> service.textSearch(request, false))
            .isInstanceOf(GoogleMapsException.class)
            .hasMessageContaining("Unsupported Google text search request field: apiKey");
        verify(googleClient, never()).textSearch(any(), any());
        verify(cacheRepository, never()).save(any());
    }

    @Test
    void textSearchRejectsDecimalPageSizeBeforeCallingGoogle() {
        JsonNode request = json("{\"textQuery\":\"pizza\",\"pageSize\":1.5}");

        assertThatThrownBy(() -> service.textSearch(request, false))
            .isInstanceOf(GoogleMapsException.class)
            .hasMessageContaining("pageSize must be an integer");
        verify(googleClient, never()).textSearch(any(), any());
    }

    @Test
    void freshTextSearchCacheHitDoesNotCallGoogle() {
        JsonNode cachedResponse = json("{\"places\":[{\"id\":\"cached\"}]}");
        when(cacheRepository.findById(any())).thenReturn(Optional.of(cacheRow(
            "places_text_search",
            "cached-key",
            cachedResponse,
            1
        )));

        JsonNode response = service.textSearch(json("{\"textQuery\":\"pizza\"}"), false);

        assertThat(response).isEqualTo(cachedResponse);
        verify(googleClient, never()).textSearch(any(), any());
    }

    @Test
    void geocodeNormalizesGoogleResultAndCachesIt() {
        when(cacheRepository.findById(any())).thenReturn(Optional.empty());
        when(googleClient.geocode("Tokyo")).thenReturn(json("""
            {
              "status": "OK",
              "results": [
                {
                  "formatted_address": "Tokyo, Japan",
                  "geometry": { "location": { "lat": 35.6812, "lng": 139.7671 } }
                }
              ]
            }
            """));

        JsonNode response = service.geocode(new GoogleGeocodeRequest(" Tokyo "));

        assertThat(response.path("label").asText()).isEqualTo("Tokyo, Japan");
        assertThat(response.path("lat").asDouble()).isEqualTo(35.6812);
        assertThat(response.path("lng").asDouble()).isEqualTo(139.7671);
        verify(googleClient).geocode("Tokyo");
    }

    @Test
    void geocodeZeroResultsReturnsJsonNull() {
        when(cacheRepository.findById(any())).thenReturn(Optional.empty());
        when(googleClient.geocode("Unknown")).thenReturn(json("{\"status\":\"ZERO_RESULTS\",\"results\":[]}"));

        JsonNode response = service.geocode(new GoogleGeocodeRequest("Unknown"));

        assertThat(response.isNull()).isTrue();
    }

    @Test
    void drivingRouteBuildsGoogleRequestAndNormalizesResponse() {
        when(cacheRepository.findById(any())).thenReturn(Optional.empty());
        when(googleClient.computeRoute(any(), eq("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration")))
            .thenReturn(json("""
                {
                  "routes": [
                    {
                      "distanceMeters": 2400,
                      "duration": "720s",
                      "polyline": { "encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
                      "legs": [
                        { "distanceMeters": 1000, "duration": "300s" },
                        { "distanceMeters": 1400, "duration": "420s" }
                      ]
                    }
                  ]
                }
                """));

        JsonNode response = service.drivingRoute(new GoogleRouteRequest(List.of(
            new GoogleLatLng(35.0, 139.0),
            new GoogleLatLng(36.0, 140.0),
            new GoogleLatLng(37.0, 141.0)
        )));

        assertThat(response.path("distance").asLong()).isEqualTo(2400);
        assertThat(response.path("duration").asLong()).isEqualTo(720);
        assertThat(response.path("legs").size()).isEqualTo(2);
        assertThat(response.path("path").size()).isEqualTo(3);

        ArgumentCaptor<JsonNode> routeRequest = ArgumentCaptor.forClass(JsonNode.class);
        verify(googleClient).computeRoute(routeRequest.capture(), eq("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration"));
        assertThat(routeRequest.getValue().path("origin").path("location").path("latLng").path("latitude").asDouble())
            .isEqualTo(35.0);
        assertThat(routeRequest.getValue().path("intermediates").size()).isEqualTo(1);
    }

    @Test
    void nearbySearchRejectsUnknownNestedLocationFieldsBeforeCallingGoogle() {
        JsonNode request = json("""
            {
              "locationRestriction": {
                "circle": {
                  "center": {
                    "latitude": 41.0,
                    "longitude": -87.0,
                    "altitude": 100
                  },
                  "radius": 75
                }
              }
            }
            """);

        assertThatThrownBy(() -> service.nearbySearch(request, false))
            .isInstanceOf(GoogleMapsException.class)
            .hasMessageContaining("Unsupported Google locationRestriction.circle.center field: altitude");
        verify(googleClient, never()).nearbySearch(any(), any());
    }

    @Test
    void nearbySearchRejectsUnsupportedRectangleBeforeCallingGoogle() {
        JsonNode request = json("""
            {
              "locationRestriction": {
                "rectangle": {
                  "low": { "latitude": 41.0, "longitude": -87.0 },
                  "high": { "latitude": 42.0, "longitude": -86.0 }
                }
              }
            }
            """);

        assertThatThrownBy(() -> service.nearbySearch(request, false))
            .isInstanceOf(GoogleMapsException.class)
            .hasMessageContaining("locationRestriction must be a circle");
        verify(googleClient, never()).nearbySearch(any(), any());
    }

    @Test
    void nearbySearchRejectsInvalidRadiusBeforeCallingGoogle() {
        JsonNode request = json("""
            {
              "locationRestriction": {
                "circle": {
                  "center": { "latitude": 41.0, "longitude": -87.0 },
                  "radius": 50001
                }
              }
            }
            """);

        assertThatThrownBy(() -> service.nearbySearch(request, false))
            .isInstanceOf(GoogleMapsException.class)
            .hasMessageContaining("radius");
        verify(googleClient, never()).nearbySearch(any(), any());
    }

    private GoogleApiCache cacheRow(String cacheName, String cacheKey, JsonNode response, long expiresInDays) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        return new GoogleApiCache(cacheName, cacheKey, response, now.minusDays(1), now.plusDays(expiresInDays));
    }

    private JsonNode json(String source) {
        try {
            return objectMapper.readTree(source);
        } catch (Exception ex) {
            throw new AssertionError(ex);
        }
    }
}
