package com.trip.service.place;

import org.springframework.http.HttpStatus;

public class PlaceDetailsException extends RuntimeException {
    private final HttpStatus status;
    private final String slug;
    private final String clientMessage;

    private PlaceDetailsException(HttpStatus status, String slug, String clientMessage, String logMessage) {
        super(logMessage);
        this.status = status;
        this.slug = slug;
        this.clientMessage = clientMessage;
    }

    public static PlaceDetailsException badRequest(String logMessage) {
        return new PlaceDetailsException(HttpStatus.BAD_REQUEST, "invalid_place_detail_fields",
            "Requested place detail fields are not supported.", logMessage);
    }

    public static PlaceDetailsException notFound(String logMessage) {
        return new PlaceDetailsException(HttpStatus.NOT_FOUND, "place_not_found",
            "Place not found.", logMessage);
    }

    public static PlaceDetailsException rateLimited(String logMessage) {
        return new PlaceDetailsException(HttpStatus.TOO_MANY_REQUESTS, "place_details_rate_limited",
            "Place details are temporarily rate limited.", logMessage);
    }

    public static PlaceDetailsException unavailable(String logMessage) {
        return new PlaceDetailsException(HttpStatus.BAD_GATEWAY, "place_details_unavailable",
            "Place details are temporarily unavailable.", logMessage);
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
