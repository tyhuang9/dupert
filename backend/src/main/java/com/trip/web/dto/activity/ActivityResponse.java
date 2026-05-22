package com.trip.web.dto.activity;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

import com.trip.domain.Activity;
import com.trip.domain.ActivityCategory;

/**
 * Public view of an {@link Activity} for API responses.
 *
 * <p>Omits the numeric {@code id} primary key; clients use the activity id for PATCH/DELETE but
 * it's only returned in the response body, not exposed as a path parameter outside of the response.
 * Includes {@code createdByUserDisplayName} and {@code updatedByUserDisplayName} for UI attribution,
 * which the service layer populates (requires a separate lookup or join).
 *
 * <p>Audit fields ({@code createdByUserId}, {@code updatedByUserId}) are internal; only display names
 * are returned to the client.
 */
public record ActivityResponse(
    long id,
    LocalDate dayDate,
    ActivityCategory category,
    LocalTime startTime,
    LocalTime endTime,
    String title,
    String notes,
    String mapboxId,
    String placeName,
    String address,
    Double lat,
    Double lng,
    int orderIndex,
    String createdByUserDisplayName,
    String updatedByUserDisplayName,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    long version
) {

    public static ActivityResponse of(Activity activity, String createdByUserDisplayName, String updatedByUserDisplayName) {
        return new ActivityResponse(
            activity.getId(),
            activity.getDayDate(),
            activity.getCategory(),
            activity.getStartTime(),
            activity.getEndTime(),
            activity.getTitle(),
            activity.getNotes(),
            activity.getMapboxId(),
            activity.getPlaceName(),
            activity.getAddress(),
            activity.getLat(),
            activity.getLng(),
            activity.getOrderIndex(),
            createdByUserDisplayName,
            updatedByUserDisplayName,
            activity.getCreatedAt(),
            activity.getUpdatedAt(),
            activity.getVersion()
        );
    }
}
