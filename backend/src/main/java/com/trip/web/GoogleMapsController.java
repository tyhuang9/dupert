package com.trip.web;

import org.springframework.context.annotation.Profile;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.trip.service.google.GoogleGeocodeRequest;
import com.trip.service.google.GoogleMapsService;
import com.trip.service.google.GoogleRouteRequest;

import jakarta.validation.Valid;

@RestController
@Validated
@Profile("!test")
public class GoogleMapsController {
    private final GoogleMapsService googleMapsService;

    public GoogleMapsController(GoogleMapsService googleMapsService) {
        this.googleMapsService = googleMapsService;
    }

    @PostMapping("/api/maps/geocode")
    public JsonNode geocode(@Valid @RequestBody GoogleGeocodeRequest body) {
        return googleMapsService.geocode(body);
    }

    @PostMapping("/api/maps/routes/driving")
    public JsonNode drivingRoute(@Valid @RequestBody GoogleRouteRequest body) {
        return googleMapsService.drivingRoute(body);
    }
}
