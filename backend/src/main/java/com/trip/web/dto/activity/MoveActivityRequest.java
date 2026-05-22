package com.trip.web.dto.activity;

import java.time.LocalDate;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Request body for moving an activity to a different day
 * ({@code POST /api/activities/{id}/move}).
 *
 * <p>The activity is relocated to a new day (must be within the trip's date range)
 * and assigned a new {@code order_index} on that day. The service updates both fields
 * atomically.
 *
 * <p>If an activity is moved to a day that has other activities, the {@code orderIndex}
 * parameter determines its position in that day's order. Activities at or after the
 * insertion point are shifted down (their indices incremented).
 */
public record MoveActivityRequest(
    @NotNull(message = "dayDate is required")
    LocalDate dayDate,

    @Min(value = 0, message = "orderIndex must be >= 0")
    int orderIndex
) {
}
