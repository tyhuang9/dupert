package com.trip.web.dto.trip;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.trip.domain.Trip;
import com.trip.domain.TripRole;

/**
 * Public view of a {@link Trip} for API responses.
 *
 * <p>Notably absent: the numeric {@code id} primary key. Clients only ever see
 * {@code publicId} — the numeric id is server-internal. Returning {@code role} on
 * every read saves the frontend from a second lookup to decide which UI affordances
 * to show (edit / delete / share).
 */
public record TripResponse(
    String publicId,
    String name,
    String destination,
    LocalDate startDate,
    LocalDate endDate,
    String imageUrl,
    OffsetDateTime createdAt,
    TripRole role
) {

    public static TripResponse of(Trip trip, TripRole role) {
        return new TripResponse(
            trip.getPublicId(),
            trip.getName(),
            trip.getDestination(),
            trip.getStartDate(),
            trip.getEndDate(),
            trip.getImageUrl(),
            trip.getCreatedAt(),
            role
        );
    }
}
