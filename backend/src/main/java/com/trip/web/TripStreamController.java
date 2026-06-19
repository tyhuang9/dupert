package com.trip.web;

import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.trip.service.realtime.TripEventBroker;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.web.auth.AuthenticationActors;

import jakarta.validation.constraints.Pattern;

/**
 * Authenticated SSE stream for realtime trip invalidation events.
 */
@RestController
@RequestMapping("/api")
@Validated
public class TripStreamController {

    static final String PUBLIC_ID_PATTERN = "[a-z0-9]{1,24}";

    private final TripAccessGuard tripAccessGuard;
    private final TripEventBroker tripEventBroker;

    public TripStreamController(TripAccessGuard tripAccessGuard, TripEventBroker tripEventBroker) {
        this.tripAccessGuard = tripAccessGuard;
        this.tripEventBroker = tripEventBroker;
    }

    @GetMapping(path = "/trips/{publicId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamTrip(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActor(
            publicId, AuthenticationActors.requireTripActor(authentication));
        return tripEventBroker.subscribe(resolved.trip().getId());
    }
}
