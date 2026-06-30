package com.trip.web;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.trip.service.place.PlaceDetailsResponse;
import com.trip.service.place.PlaceDetailsService;

@RestController
@Profile("!test")
public class PlaceDetailsController {
    private final PlaceDetailsService placeDetailsService;

    public PlaceDetailsController(PlaceDetailsService placeDetailsService) {
        this.placeDetailsService = placeDetailsService;
    }

    @GetMapping("/api/places/{placeId}/details")
    public PlaceDetailsResponse details(@PathVariable String placeId,
                                        @RequestParam(required = false) String fields,
                                        @RequestParam(required = false) String sessionToken) {
        return placeDetailsService.details(placeId, fields, sessionToken);
    }
}
