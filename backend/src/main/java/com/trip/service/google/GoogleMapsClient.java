package com.trip.service.google;

import com.fasterxml.jackson.databind.JsonNode;

public interface GoogleMapsClient {
    JsonNode autocomplete(JsonNode request, String fieldMask);

    JsonNode textSearch(JsonNode request, String fieldMask);

    JsonNode nearbySearch(JsonNode request, String fieldMask);

    JsonNode photoMedia(String photoName, int maxWidthPx, int maxHeightPx);

    JsonNode geocode(String address);

    JsonNode computeRoute(JsonNode request, String fieldMask);
}
