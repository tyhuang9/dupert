package com.trip.web.dto.trip;

import java.time.LocalDate;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code PATCH /api/trips/{publicId}}. PATCH semantics: a {@code null}
 * field means "leave it alone". Each provided field is validated against the same rules
 * as {@link CreateTripRequest}; cross-field validation (start ≤ end, day-count cap) is
 * applied in the service after merging with the persisted state so a partial update
 * can't slip through by omitting one half of the date range.
 */
public record UpdateTripRequest(
    @Size(min = 1, max = 200)
    @Pattern(regexp = "^[^\\u0000-\\u001F\\u007F]+$", message = "must not contain control characters")
    String name,

    @Size(max = 200)
    @Pattern(regexp = "^[^\\u0000-\\u001F\\u007F]*$", message = "must not contain control characters")
    String destination,

    LocalDate startDate,

    LocalDate endDate
) {
}
