package com.trip.web.dto.activity;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Request body for reordering activities within a single day
 * ({@code POST /api/trips/{publicId}/days/{date}/order}).
 *
 * <p>The caller provides a list of activity IDs representing the desired order.
 * All activities in the list must belong to the specified day of the trip.
 * The service updates the {@code order_index} of each activity atomically.
 *
 * <p>If the list is incomplete (missing some activities for the day), the service
 * treats the request as authoritative: activities not in the list are moved to the
 * end with indices appended after the provided list. This allows "reorder these, keep
 * the rest at the bottom" semantics.
 *
 * <p>Resource cap: the list must not exceed a reasonable size (prevent client from
 * asking the server to allocate huge memory for index recomputation).
 */
public record ReorderActivitiesRequest(
    @NotEmpty(message = "activityIds must not be empty")
    @Size(max = 500, message = "activityIds must not exceed 500 items")
    List<Long> activityIds
) {
}
