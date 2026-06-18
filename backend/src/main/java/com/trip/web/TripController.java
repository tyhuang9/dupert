package com.trip.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.trip.service.trip.TripService;
import com.trip.web.auth.AuthenticationActors;
import com.trip.web.dto.trip.CreateTripRequest;
import com.trip.web.dto.trip.TripResponse;
import com.trip.web.dto.trip.UpdateTripRequest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

/**
 * HTTP surface for trip CRUD. All endpoints require an authenticated principal
 * (gated by {@link com.trip.config.SecurityConfig}'s {@code /api/trips/**} →
 * {@code authenticated()} rule).
 *
 * <p>Per-trip access is enforced inside {@link TripService} via
 * {@link com.trip.service.trip.TripAccessGuard}. Non-members and members with
 * insufficient role both receive 404 — never 403 — so {@code publicId} cannot be used
 * as an existence oracle. See PROJECT.md §5.
 */
@RestController
@RequestMapping("/api/trips")
@Validated
public class TripController {

    /** Matches the {@link com.trip.service.trip.PublicIdGenerator} alphabet (digits 2-9
     *  and lowercase letters minus {@code 0/1/i/l/o}) at length 1-24. Format-invalid
     *  ids fail with 400 (validation_failed) rather than 404 — they would never collide
     *  with a real trip, so collapsing to 404 would just hide caller bugs. */
    static final String PUBLIC_ID_PATTERN = "[a-z0-9]{1,24}";

    private final TripService tripService;

    public TripController(TripService tripService) {
        this.tripService = tripService;
    }

    @PostMapping
    public ResponseEntity<TripResponse> create(@Valid @RequestBody CreateTripRequest body,
                                               Authentication authentication) {
        Long userId = AuthenticationActors.requireUserId(authentication);
        TripResponse created = tripService.createTrip(userId, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public ResponseEntity<List<TripResponse>> list(Authentication authentication) {
        Long userId = AuthenticationActors.requireUserId(authentication);
        return ResponseEntity.ok(tripService.listTripsForUser(userId));
    }

    @GetMapping("/{publicId}")
    public ResponseEntity<TripResponse> get(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        return ResponseEntity.ok(tripService.getTrip(
            publicId, AuthenticationActors.requireTripActor(authentication)));
    }

    @PatchMapping("/{publicId}")
    public ResponseEntity<TripResponse> update(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @Valid @RequestBody UpdateTripRequest body,
            Authentication authentication) {
        return ResponseEntity.ok(tripService.updateTrip(
            publicId, AuthenticationActors.requireTripActor(authentication), body));
    }

    @DeleteMapping("/{publicId}")
    public ResponseEntity<Void> delete(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        Long userId = AuthenticationActors.requireUserId(authentication);
        tripService.deleteTrip(publicId, userId);
        return ResponseEntity.noContent().build();
    }
}
