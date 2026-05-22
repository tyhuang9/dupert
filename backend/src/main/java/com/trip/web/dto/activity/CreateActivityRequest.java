package com.trip.web.dto.activity;

import java.time.LocalDate;
import java.time.LocalTime;

import com.trip.domain.ActivityCategory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body for creating a new activity ({@code POST /api/trips/{publicId}/activities}).
 *
 * <p>All string fields are sanitized by the controller before persisting; the constraint
 * annotations below ensure the untrusted input is reasonable before business logic runs.
 *
 * <p>Validation:
 * - {@code dayDate} must fall within the trip's start/end date range (validated in the service).
 * - {@code category} must be a valid enum value (handled by Spring's enum deserialization).
 * - Times are optional; if both are provided, {@code endTime >= startTime} (validated in the DB).
 * - Coordinates, if provided, must be valid lat/lng ranges (validated in the DB).
 *
 * <p>{@code orderIndex} is omitted here; the service computes it as max + 1 for the day.
 * {@code mapboxId}, {@code placeName}, {@code address}, {@code lat}, {@code lng} are typically
 * populated by the frontend from a Mapbox search result, but the service allows null.
 */
public record CreateActivityRequest(
    @NotNull(message = "category is required")
    ActivityCategory category,

    @NotBlank(message = "title is required")
    @Size(min = 1, max = 200, message = "title must be between 1 and 200 characters")
    String title,

    @Size(max = 5000, message = "notes must not exceed 5000 characters")
    String notes,

    LocalTime startTime,
    LocalTime endTime,

    String mapboxId,
    String placeName,
    String address,

    @Min(value = -90, message = "lat must be between -90 and 90")
    @Max(value = 90, message = "lat must be between -90 and 90")
    Double lat,

    @Min(value = -180, message = "lng must be between -180 and 180")
    @Max(value = 180, message = "lng must be between -180 and 180")
    Double lng
) {
}
