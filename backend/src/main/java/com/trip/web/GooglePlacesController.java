package com.trip.web;

import org.springframework.context.annotation.Profile;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.trip.service.google.GoogleMapsService;
import com.trip.service.google.GooglePhotoUrlRequest;
import com.trip.service.google.GooglePhotoUrlResponse;

import jakarta.validation.Valid;

@RestController
@Validated
@Profile("!test")
public class GooglePlacesController {
    private final GoogleMapsService googleMapsService;

    public GooglePlacesController(GoogleMapsService googleMapsService) {
        this.googleMapsService = googleMapsService;
    }

    @PostMapping("/api/places/autocomplete")
    public JsonNode autocomplete(@RequestBody JsonNode body) {
        return googleMapsService.autocomplete(body);
    }

    @PostMapping("/api/places/text-search")
    public JsonNode textSearch(@RequestBody JsonNode body,
                               @RequestParam(defaultValue = "true") boolean includePhoto) {
        return googleMapsService.textSearch(body, includePhoto);
    }

    @PostMapping("/api/places/nearby-search")
    public JsonNode nearbySearch(@RequestBody JsonNode body,
                                 @RequestParam(defaultValue = "false") boolean includePhoto) {
        return googleMapsService.nearbySearch(body, includePhoto);
    }

    @PostMapping("/api/places/photo-url")
    public GooglePhotoUrlResponse photoUrl(@Valid @RequestBody GooglePhotoUrlRequest body) {
        return googleMapsService.photoUrl(body);
    }
}
