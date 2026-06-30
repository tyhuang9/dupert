package com.trip.service.google;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;

@Component
@Profile("!test")
public class HttpGoogleMapsClient implements GoogleMapsClient {
    private static final String PLACES_BASE_URL = "https://places.googleapis.com/v1";
    private static final String GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
    private static final String ROUTES_COMPUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public HttpGoogleMapsClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this(appProperties, objectMapper, HttpClient.newHttpClient());
    }

    HttpGoogleMapsClient(AppProperties appProperties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @Override
    public JsonNode autocomplete(JsonNode request, String fieldMask) {
        return postJson(URI.create(PLACES_BASE_URL + "/places:autocomplete"), request, fieldMask,
            "Google Places autocomplete");
    }

    @Override
    public JsonNode textSearch(JsonNode request, String fieldMask) {
        return postJson(URI.create(PLACES_BASE_URL + "/places:searchText"), request, fieldMask,
            "Google Places text search");
    }

    @Override
    public JsonNode nearbySearch(JsonNode request, String fieldMask) {
        return postJson(URI.create(PLACES_BASE_URL + "/places:searchNearby"), request, fieldMask,
            "Google Places nearby search");
    }

    @Override
    public JsonNode photoMedia(String photoName, int maxWidthPx, int maxHeightPx) {
        String normalizedPhotoName = normalizePhotoName(photoName);
        URI uri = URI.create(PLACES_BASE_URL + "/" + pathEncode(normalizedPhotoName) + "/media"
            + "?maxWidthPx=" + maxWidthPx
            + "&maxHeightPx=" + maxHeightPx
            + "&skipHttpRedirect=true"
            + "&key=" + queryEncode(apiKey()));
        HttpRequest request = HttpRequest.newBuilder(uri).GET().build();
        return send(request, "Google Places photo media");
    }

    @Override
    public JsonNode geocode(String address) {
        URI uri = URI.create(GEOCODING_URL + "?address=" + queryEncode(address) + "&key=" + queryEncode(apiKey()));
        HttpRequest request = HttpRequest.newBuilder(uri).GET().build();
        return send(request, "Google Geocoding");
    }

    @Override
    public JsonNode computeRoute(JsonNode requestBody, String fieldMask) {
        return postJson(URI.create(ROUTES_COMPUTE_URL), requestBody, fieldMask, "Google Routes compute");
    }

    private JsonNode postJson(URI uri, JsonNode requestBody, String fieldMask, String context) {
        String body;
        try {
            body = objectMapper.writeValueAsString(requestBody);
        } catch (JsonProcessingException ex) {
            throw GoogleMapsException.badRequest(context + " request could not be serialized");
        }

        HttpRequest request = HttpRequest.newBuilder(uri)
            .header("Content-Type", "application/json")
            .header("X-Goog-Api-Key", apiKey())
            .header("X-Goog-FieldMask", fieldMask)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        return send(request, context);
    }

    private JsonNode send(HttpRequest request, String context) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) {
                return objectMapper.readTree(response.body());
            }
            if (status == 404) {
                throw GoogleMapsException.notFound(context + " returned 404");
            }
            if (status == 429) {
                throw GoogleMapsException.rateLimited(context + " returned 429");
            }
            if (status == 400) {
                throw GoogleMapsException.badRequest(context + " returned 400");
            }
            throw GoogleMapsException.unavailable(context + " returned HTTP " + status);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw GoogleMapsException.unavailable(context + " request was interrupted");
        } catch (JsonProcessingException ex) {
            throw GoogleMapsException.unavailable(context + " response could not be parsed");
        } catch (IOException ex) {
            throw GoogleMapsException.unavailable(context + " request failed: " + ex.getClass().getSimpleName());
        }
    }

    private String apiKey() {
        String apiKey = appProperties.getGoogleMapsApiKey().strip();
        if (apiKey.isEmpty()) {
            throw GoogleMapsException.unavailable("Google Maps API key is not configured");
        }
        return apiKey;
    }

    private static String normalizePhotoName(String photoName) {
        String normalized = photoName == null ? "" : photoName.strip().replaceFirst("^/+", "");
        if (normalized.isEmpty() || !normalized.startsWith("places/")) {
            throw GoogleMapsException.badRequest("Google photo name is required");
        }
        return normalized;
    }

    private static String pathEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
            .replace("+", "%20")
            .replace("%2F", "/");
    }

    private static String queryEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
