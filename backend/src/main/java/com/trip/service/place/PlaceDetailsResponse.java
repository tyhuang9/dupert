package com.trip.service.place;

import com.fasterxml.jackson.databind.JsonNode;

public record PlaceDetailsResponse(
    String placeId,
    String fieldMask,
    String source,
    boolean stale,
    JsonNode details
) {
}
