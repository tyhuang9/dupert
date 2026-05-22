package com.trip.web.dto.activity;

import java.time.LocalTime;

import com.trip.domain.ActivityCategory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for updating an existing activity ({@code PATCH /api/activities/{id}}).
 *
 * <p>All fields are optional; only provided fields are updated. Omitted fields remain unchanged.
 * Moving an activity to a different day is a separate operation ({@code PATCH /api/activities/{id}/move}).
 *
 * <p>Validation rules mirror {@link CreateActivityRequest} but are less strict (e.g., title is
 * not required to update other fields). Times can be cleared by passing {@code null}.
 */
public record UpdateActivityRequest(
    ActivityCategory category,

    @NotBlank(message = "title must not be blank if provided")
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
