package com.trip.service.place;

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
public class HttpGooglePlaceDetailsClient implements GooglePlaceDetailsClient {
    private static final String GOOGLE_PLACE_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places/";

    private final AppProperties appProperties;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public HttpGooglePlaceDetailsClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this(appProperties, objectMapper, HttpClient.newHttpClient());
    }

    HttpGooglePlaceDetailsClient(AppProperties appProperties,
                                 ObjectMapper objectMapper,
                                 HttpClient httpClient) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @Override
    public JsonNode fetchDetails(String placeId, String fieldMask, String sessionToken) {
        String apiKey = appProperties.getGoogleMapsServerApiKey().strip();
        if (apiKey.isEmpty()) {
            throw PlaceDetailsException.unavailable("Google Maps API key is not configured");
        }

        HttpRequest request = HttpRequest.newBuilder(detailsUri(placeId, sessionToken))
            .header("X-Goog-Api-Key", apiKey)
            .header("X-Goog-FieldMask", fieldMask)
            .GET()
            .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status == 200) {
                return objectMapper.readTree(response.body());
            }
            if (status == 404) {
                throw PlaceDetailsException.notFound("Google Place Details returned 404");
            }
            if (status == 429) {
                throw PlaceDetailsException.rateLimited("Google Place Details returned 429");
            }
            throw PlaceDetailsException.unavailable("Google Place Details returned HTTP " + status);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw PlaceDetailsException.unavailable("Google Place Details request was interrupted");
        } catch (JsonProcessingException ex) {
            throw PlaceDetailsException.unavailable("Google Place Details response could not be parsed");
        } catch (IOException ex) {
            throw PlaceDetailsException.unavailable("Google Place Details request failed: " + ex.getClass().getSimpleName());
        }
    }

    private static URI detailsUri(String placeId, String sessionToken) {
        String encodedPlaceId = URLEncoder.encode(placeId, StandardCharsets.UTF_8).replace("+", "%20");
        String normalizedSessionToken = sessionToken == null ? "" : sessionToken.strip();
        if (normalizedSessionToken.isEmpty()) {
            return URI.create(GOOGLE_PLACE_DETAILS_BASE_URL + encodedPlaceId);
        }
        String encodedSessionToken = URLEncoder.encode(normalizedSessionToken, StandardCharsets.UTF_8)
            .replace("+", "%20");
        return URI.create(GOOGLE_PLACE_DETAILS_BASE_URL + encodedPlaceId + "?sessionToken=" + encodedSessionToken);
    }
}
