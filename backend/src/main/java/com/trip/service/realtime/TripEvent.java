package com.trip.service.realtime;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Pointer-style realtime event. Payloads identify what changed; subscribers refetch
 * through the normal authenticated REST endpoints.
 */
public record TripEvent(
    String type,
    String publicId,
    Long activityId,
    LocalDate dayDate,
    Instant occurredAt
) {
    public static TripEvent activityCreated(String publicId, Long activityId, LocalDate dayDate) {
        return activityEvent("activity.created", publicId, activityId, dayDate);
    }

    public static TripEvent activityUpdated(String publicId, Long activityId, LocalDate dayDate) {
        return activityEvent("activity.updated", publicId, activityId, dayDate);
    }

    public static TripEvent activityDeleted(String publicId, Long activityId, LocalDate dayDate) {
        return activityEvent("activity.deleted", publicId, activityId, dayDate);
    }

    public static TripEvent activityMoved(String publicId, Long activityId, LocalDate dayDate) {
        return activityEvent("activity.moved", publicId, activityId, dayDate);
    }

    public static TripEvent dayReordered(String publicId, LocalDate dayDate) {
        return new TripEvent("day.reordered", publicId, null, dayDate, Instant.now());
    }

    public static TripEvent shareLinksChanged(String publicId) {
        return new TripEvent("share-links.changed", publicId, null, null, Instant.now());
    }

    public static TripEvent membersChanged(String publicId) {
        return new TripEvent("members.changed", publicId, null, null, Instant.now());
    }

    private static TripEvent activityEvent(String type, String publicId, Long activityId, LocalDate dayDate) {
        return new TripEvent(type, publicId, activityId, dayDate, Instant.now());
    }
}
