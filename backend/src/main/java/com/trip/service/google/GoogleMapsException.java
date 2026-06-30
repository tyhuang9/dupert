package com.trip.service.google;

import org.springframework.http.HttpStatus;

public class GoogleMapsException extends RuntimeException {
    private final HttpStatus status;
    private final String slug;
    private final String clientMessage;

    private GoogleMapsException(HttpStatus status, String slug, String clientMessage, String logMessage) {
        super(logMessage);
        this.status = status;
        this.slug = slug;
        this.clientMessage = clientMessage;
    }

    public static GoogleMapsException badRequest(String logMessage) {
        return new GoogleMapsException(HttpStatus.BAD_REQUEST, "invalid_google_maps_request",
            "The Google Maps request is invalid.", logMessage);
    }

    public static GoogleMapsException notFound(String logMessage) {
        return new GoogleMapsException(HttpStatus.NOT_FOUND, "google_maps_result_not_found",
            "Google Maps result not found.", logMessage);
    }

    public static GoogleMapsException rateLimited(String logMessage) {
        return new GoogleMapsException(HttpStatus.TOO_MANY_REQUESTS, "google_maps_rate_limited",
            "Google Maps is temporarily rate limited.", logMessage);
    }

    public static GoogleMapsException unavailable(String logMessage) {
        return new GoogleMapsException(HttpStatus.BAD_GATEWAY, "google_maps_unavailable",
            "Google Maps is temporarily unavailable.", logMessage);
    }

    public HttpStatus status() {
        return status;
    }

    public String slug() {
        return slug;
    }

    public String clientMessage() {
        return clientMessage;
    }
}
