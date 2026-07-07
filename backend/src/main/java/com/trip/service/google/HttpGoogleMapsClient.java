package com.trip.service.google;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(HttpGoogleMapsClient.class);
    private static final String PLACES_BASE_URL = "https://places.googleapis.com/v1";
    private static final String GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
    private static final String ROUTES_COMPUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
    private static final Duration GOOGLE_HTTP_TIMEOUT = Duration.ofSeconds(8);
    private static final int MAX_UPSTREAM_DIAGNOSTIC_CHARS = 300;

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public HttpGoogleMapsClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this(appProperties, objectMapper, HttpClient.newBuilder()
            .connectTimeout(GOOGLE_HTTP_TIMEOUT)
            .build());
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
        HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(GOOGLE_HTTP_TIMEOUT)
            .GET()
            .build();
        return send(request, "Google Places photo media");
    }

    @Override
    public JsonNode geocode(String address) {
        URI uri = URI.create(GEOCODING_URL + "?address=" + queryEncode(address) + "&key=" + queryEncode(apiKey()));
        HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(GOOGLE_HTTP_TIMEOUT)
            .GET()
            .build();
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
            .timeout(GOOGLE_HTTP_TIMEOUT)
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
            String diagnostic = upstreamDiagnostic(response.body());
            if (diagnostic.isBlank()) {
                log.warn("{} returned HTTP {}", context, status);
            } else {
                log.warn("{} returned HTTP {}: {}", context, status, diagnostic);
            }
            String failureMessage = upstreamFailureMessage(context, status, diagnostic);
            if (status == 404) {
                throw GoogleMapsException.notFound(failureMessage);
            }
            if (status == 429) {
                throw GoogleMapsException.rateLimited(failureMessage);
            }
            if (status == 400) {
                throw GoogleMapsException.badRequest(failureMessage);
            }
            throw GoogleMapsException.unavailable(failureMessage);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw GoogleMapsException.unavailable(context + " request was interrupted");
        } catch (JsonProcessingException ex) {
            throw GoogleMapsException.unavailable(context + " response could not be parsed");
        } catch (IOException ex) {
            throw GoogleMapsException.unavailable(context + " request failed: " + ex.getClass().getSimpleName());
        }
    }

    private String upstreamFailureMessage(String context, int status, String diagnostic) {
        if (diagnostic.isBlank()) {
            return context + " returned HTTP " + status;
        }
        return context + " returned HTTP " + status + ": " + diagnostic;
    }

    private String upstreamDiagnostic(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }

        try {
            JsonNode root = objectMapper.readTree(body);
            List<String> parts = new ArrayList<>();
            JsonNode error = root.path("error");
            addTextPart(parts, error.path("status"));
            addTextPart(parts, error.path("message"));
            if (parts.isEmpty()) {
                addTextPart(parts, root.path("status"));
                addTextPart(parts, root.path("error_message"));
            }
            return truncateDiagnostic(String.join(": ", parts));
        } catch (JsonProcessingException ex) {
            return "unparseable upstream error body";
        }
    }

    private static void addTextPart(List<String> parts, JsonNode node) {
        if (!node.isTextual()) {
            return;
        }
        String value = node.asText().strip();
        if (!value.isEmpty()) {
            parts.add(value);
        }
    }

    private static String truncateDiagnostic(String value) {
        String normalized = value.strip().replaceAll("\\s+", " ");
        if (normalized.length() <= MAX_UPSTREAM_DIAGNOSTIC_CHARS) {
            return normalized;
        }
        return normalized.substring(0, MAX_UPSTREAM_DIAGNOSTIC_CHARS - 3) + "...";
    }

    private String apiKey() {
        String apiKey = appProperties.getGoogleMapsServerApiKey().strip();
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
