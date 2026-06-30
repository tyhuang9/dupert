package com.trip.service.place;

import com.fasterxml.jackson.databind.JsonNode;

public interface GooglePlaceDetailsClient {
    default JsonNode fetchDetails(String placeId, String fieldMask) {
        return fetchDetails(placeId, fieldMask, null);
    }

    JsonNode fetchDetails(String placeId, String fieldMask, String sessionToken);
}
