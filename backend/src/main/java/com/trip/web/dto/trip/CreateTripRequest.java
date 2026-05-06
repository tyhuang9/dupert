package com.trip.web.dto.trip;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/trips}.
 *
 * <p>Cross-field rules ({@code startDate <= endDate}, day-count cap) are enforced in
 * the service layer rather than the DTO so the validation message can be sanitized
 * uniformly through {@code GlobalExceptionHandler}.
 *
 * <p>The {@code @Pattern} on {@code name} and {@code destination} rejects ASCII
 * control chars + DEL + null bytes — same shape as the display-name guard in
 * {@code RegisterRequest}. Service-layer trimming / NFC normalization happens in
 * Chunk 3b's {@code TripService}.
 */
public record CreateTripRequest(
    @NotBlank
    @Size(min = 1, max = 200)
    @Pattern(regexp = "^[^\\u0000-\\u001F\\u007F]+$", message = "must not contain control characters")
    String name,

    @Size(max = 200)
    @Pattern(regexp = "^[^\\u0000-\\u001F\\u007F]*$", message = "must not contain control characters")
    String destination,

    @NotNull
    LocalDate startDate,

    @NotNull
    LocalDate endDate
) {
}
