package com.trip.service.place;

import com.fasterxml.jackson.databind.JsonNode;

public interface GooglePlaceDetailsClient {
    JsonNode fetchDetails(String placeId, String fieldMask);
}
