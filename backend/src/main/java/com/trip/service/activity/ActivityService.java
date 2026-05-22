package com.trip.service.activity;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.Activity;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.UserRepository;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.domain.TripRole;
import com.trip.repo.GuestSessionRepository;
import com.trip.domain.GuestSession;
import com.trip.web.dto.activity.ActivityResponse;
import com.trip.web.dto.activity.CreateActivityRequest;
import com.trip.web.dto.activity.UpdateActivityRequest;
import com.trip.web.dto.activity.MoveActivityRequest;
import com.trip.web.dto.activity.ReorderActivitiesRequest;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;

/**
 * Activity write operations. All per-trip access is gated through
 * {@link TripAccessGuard} to enforce the access invariant (PROJECT.md §5).
 *
 * <p>Editors can create and modify activities; viewers cannot. Every activity write
 * includes an IDOR check: the activity's {@code trip_id} is verified to match the
 * caller's accessible trip, so a caller cannot write to another user's trip even
 * if they somehow guess an activity id.
 *
 * <p>Activity responses include {@code createdByUserDisplayName} and
 * {@code updatedByUserDisplayName}, populated by this service. Null names mean the
 * creator was a guest (display name not persisted in the activity row).
 */
@Service
public class ActivityService {

    /** Resource cap: max activities per trip. Prevents malicious bulk creation. */
    static final long MAX_ACTIVITIES_PER_TRIP = 1000L;

    /** Resource cap: max character length for the reorder request body. */
    static final long MAX_REORDER_REQUEST_SIZE = 500L;

    private final ActivityRepository activityRepository;
    private final UserRepository userRepository;
    private final GuestSessionRepository guestSessionRepository;
    private final TripAccessGuard tripAccessGuard;

    public ActivityService(ActivityRepository activityRepository,
                           UserRepository userRepository,
                           GuestSessionRepository guestSessionRepository,
                           TripAccessGuard tripAccessGuard) {
        this.activityRepository = activityRepository;
        this.userRepository = userRepository;
        this.guestSessionRepository = guestSessionRepository;
        this.tripAccessGuard = tripAccessGuard;
    }

    /**
     * Create an activity on a specific day of a trip. Requires EDITOR role.
     *
     * @param publicId the trip's public id
     * @param userId the authenticated user's id
     * @param dayDate the date within the trip to add the activity to
     * @param request the activity details
     * @return the created activity
     * @throws NotFoundException if the trip doesn't exist or the user is not a member
     * @throws ValidationException if the date is outside the trip's date range or
     *         the trip already has MAX_ACTIVITIES_PER_TRIP activities
     */
    @Transactional
    public ActivityResponse createActivity(String publicId, Long userId, LocalDate dayDate,
                                           CreateActivityRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);
        Long tripId = resolved.trip().getId();

        // Validate the day is within the trip's date range
        if (dayDate.isBefore(resolved.trip().getStartDate()) ||
            dayDate.isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }

        // Enforce resource cap
        long count = activityRepository.countByTripId(tripId);
        if (count >= MAX_ACTIVITIES_PER_TRIP) {
            throw new ValidationException("activity_limit_exceeded",
                "Trip has reached the maximum number of activities");
        }

        // Compute the next order index for this day
        int maxIndex = activityRepository.findMaxOrderIndexForDay(tripId, dayDate);
        int nextIndex = maxIndex + 1;

        // Create the activity
        Activity activity = new Activity(tripId, dayDate, request.category(), request.title());
        activity.setNotes(request.notes());
        activity.setStartTime(request.startTime());
        activity.setEndTime(request.endTime());
        activity.setMapboxId(request.mapboxId());
        activity.setPlaceName(request.placeName());
        activity.setAddress(request.address());
        activity.setLat(request.lat());
        activity.setLng(request.lng());
        activity.setOrderIndex(nextIndex);
        activity.setCreatedByUserId(userId);
        activity.setUpdatedByUserId(userId);

        Activity saved = activityRepository.save(activity);

        // Load display names for the response
        String createdByName = userRepository.findById(userId)
            .map(User::getDisplayName)
            .orElse(null);

        return ActivityResponse.of(saved, createdByName, createdByName);
    }

    /**
     * Retrieve all activities for a trip within its date range, ordered by day and index.
     *
     * @param publicId the trip's public id
     * @param userId the authenticated user's id
     * @return list of activities with display name attribution
     * @throws NotFoundException if the trip doesn't exist or the user is not a member
     */
    @Transactional(readOnly = true)
    public List<ActivityResponse> listActivities(String publicId, Long userId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUser(publicId, userId);
        Long tripId = resolved.trip().getId();

        List<Activity> activities = activityRepository.findAllInDateRange(
            tripId,
            resolved.trip().getStartDate(),
            resolved.trip().getEndDate());

        return activities.stream()
            .map(a -> buildActivityResponse(a))
            .toList();
    }

    /**
     * Update an activity. Requires EDITOR role. The activity's {@code trip_id} is verified
     * to belong to an accessible trip (IDOR check).
     *
     * @param activityId the activity's id
     * @param userId the authenticated user's id
     * @param publicId the trip's public id (used for access check)
     * @param request the updated activity details (optional fields)
     * @return the updated activity
     * @throws NotFoundException if the activity or trip doesn't exist or the user lacks access
     */
    @Transactional
    public ActivityResponse updateActivity(Long activityId, Long userId, String publicId,
                                           UpdateActivityRequest request) {
        // First verify access to the trip
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);

        // Then load the activity and verify it belongs to the accessed trip
        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new NotFoundException("activity not found: id=" + activityId));

        if (!activity.getTripId().equals(resolved.trip().getId())) {
            throw new NotFoundException(
                "activity does not belong to this trip: activityId=" + activityId);
        }

        // Apply updates only if provided
        if (request.category() != null) {
            activity.setCategory(request.category());
        }
        if (request.title() != null) {
            activity.setTitle(request.title());
        }
        if (request.notes() != null) {
            activity.setNotes(request.notes());
        }
        if (request.startTime() != null) {
            activity.setStartTime(request.startTime());
        }
        if (request.endTime() != null) {
            activity.setEndTime(request.endTime());
        }
        if (request.mapboxId() != null) {
            activity.setMapboxId(request.mapboxId());
        }
        if (request.placeName() != null) {
            activity.setPlaceName(request.placeName());
        }
        if (request.address() != null) {
            activity.setAddress(request.address());
        }
        if (request.lat() != null) {
            activity.setLat(request.lat());
        }
        if (request.lng() != null) {
            activity.setLng(request.lng());
        }

        activity.setUpdatedByUserId(userId);
        Activity updated = activityRepository.save(activity);

        return buildActivityResponse(updated);
    }

    /**
     * Delete an activity. Requires EDITOR role. The activity's {@code trip_id} is verified
     * to belong to an accessible trip (IDOR check).
     *
     * @param activityId the activity's id
     * @param userId the authenticated user's id
     * @param publicId the trip's public id (used for access check)
     * @throws NotFoundException if the activity or trip doesn't exist or the user lacks access
     */
    @Transactional
    public void deleteActivity(Long activityId, Long userId, String publicId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);

        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new NotFoundException("activity not found: id=" + activityId));

        if (!activity.getTripId().equals(resolved.trip().getId())) {
            throw new NotFoundException(
                "activity does not belong to this trip: activityId=" + activityId);
        }

        activityRepository.delete(activity);
    }

    /**
     * Helper to build an {@link ActivityResponse} with display names populated.
     */
    private ActivityResponse buildActivityResponse(Activity activity) {
        String createdByName = null;
        if (activity.getCreatedByUserId() != null) {
            createdByName = userRepository.findById(activity.getCreatedByUserId())
                .map(User::getDisplayName)
                .orElse(null);
        } else if (activity.getCreatedByGuestSessionId() != null) {
            // For guests, we don't have a persisted display name; this will be null
            // The frontend handles display of guest-created items (UI enhancement in later pieces)
            createdByName = null;
        }

        String updatedByName = null;
        if (activity.getUpdatedByUserId() != null) {
            updatedByName = userRepository.findById(activity.getUpdatedByUserId())
                .map(User::getDisplayName)
                .orElse(null);
        } else if (activity.getUpdatedByGuestSessionId() != null) {
            updatedByName = null;
        }

        return ActivityResponse.of(activity, createdByName, updatedByName);
    }

    /**
     * Reorder activities within a single day. The provided list of activity IDs defines
     * the desired order; activities are assigned new {@code order_index} values (0, 1, 2, ...)
     * atomically.
     *
     * <p>All activities in the request must belong to the specified day of the specified trip.
     * Activities not in the request are moved to the end with indices continuing from the
     * last provided index.
     *
     * <p>Requires EDITOR role. Optimistic locking is NOT used here (unlike individual PATCH);
     * the entire reorder is a bulk operation that accepts the latest state of all affected
     * rows. If two concurrent reorder requests arrive, the last one wins.
     *
     * @param publicId the trip's public id
     * @param dayDate the date whose activities are being reordered
     * @param userId the authenticated user's id
     * @param request the list of activity IDs in the desired order
     * @throws NotFoundException if the trip doesn't exist or the user lacks access
     * @throws ValidationException if any activity in the list doesn't belong to the trip/day
     */
    @Transactional
    public void reorderActivitiesForDay(String publicId, LocalDate dayDate, Long userId,
                                        ReorderActivitiesRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);
        Long tripId = resolved.trip().getId();

        // Validate the day is within the trip's date range
        if (dayDate.isBefore(resolved.trip().getStartDate()) ||
            dayDate.isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }

        // Load all activities for this day
        List<Activity> currentDayActivities = activityRepository.findByTripIdAndDayDateOrderByOrderIndex(tripId, dayDate);

        // Validate that all provided IDs belong to this trip/day and build a lookup map
        var requestedIds = request.activityIds();
        var activityById = new java.util.HashMap<Long, Activity>();
        for (Activity a : currentDayActivities) {
            activityById.put(a.getId(), a);
        }

        for (Long id : requestedIds) {
            if (!activityById.containsKey(id)) {
                throw new ValidationException("activity_not_found_for_day",
                    "Activity id=" + id + " does not belong to trip=" + tripId + " day=" + dayDate);
            }
        }

        // Update the order_index for all provided activities
        int nextIndex = 0;
        for (Long id : requestedIds) {
            Activity activity = activityById.get(id);
            activity.setOrderIndex(nextIndex);
            activity.setUpdatedByUserId(userId);
            activityRepository.save(activity);
            nextIndex++;
        }

        // Activities not in the request are moved to the end
        for (Activity a : currentDayActivities) {
            if (!requestedIds.contains(a.getId())) {
                a.setOrderIndex(nextIndex);
                a.setUpdatedByUserId(userId);
                activityRepository.save(a);
                nextIndex++;
            }
        }
    }

    /**
     * Move an activity to a different day and optionally change its order. Requires EDITOR role.
     * The activity's trip is verified to be accessible (IDOR check).
     *
     * <p>When an activity is inserted at a specific order index on the destination day,
     * all existing activities at or after that index are shifted down (their indices incremented).
     *
     * @param activityId the activity's id
     * @param userId the authenticated user's id
     * @param publicId the trip's public id (used for access check)
     * @param request the destination day and order index
     * @return the updated activity
     * @throws NotFoundException if the activity or trip doesn't exist or the user lacks access
     * @throws ValidationException if the destination day is outside the trip's date range
     */
    @Transactional
    public ActivityResponse moveActivity(Long activityId, Long userId, String publicId,
                                         MoveActivityRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);
        Long tripId = resolved.trip().getId();

        // Validate the destination day is within the trip's date range
        if (request.dayDate().isBefore(resolved.trip().getStartDate()) ||
            request.dayDate().isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }

        // Load and verify the activity belongs to this trip
        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new NotFoundException("activity not found: id=" + activityId));

        if (!activity.getTripId().equals(tripId)) {
            throw new NotFoundException(
                "activity does not belong to this trip: activityId=" + activityId);
        }

        LocalDate sourceDayDate = activity.getDayDate();
        LocalDate destDayDate = request.dayDate();
        int targetIndex = request.orderIndex();

        // If moving within the same day, just reorder in-place
        if (sourceDayDate.equals(destDayDate)) {
            List<Activity> dayActivities = activityRepository.findByTripIdAndDayDateOrderByOrderIndex(tripId, sourceDayDate);

            // Build a lookup and remove the moving activity
            var activityById = new java.util.HashMap<Long, Activity>();
            for (Activity a : dayActivities) {
                if (!a.getId().equals(activityId)) {
                    activityById.put(a.getId(), a);
                }
            }

            // Rebuild indices: activities at or after targetIndex are pushed down
            int index = 0;
            for (Activity a : dayActivities) {
                if (a.getId().equals(activityId)) {
                    // This is the moving activity; set its index
                    activity.setOrderIndex(Math.min(targetIndex, activityById.size()));
                } else if (index >= targetIndex) {
                    // This activity is at or after the insertion point; shift it down
                    a.setOrderIndex(index + 1);
                    activityRepository.save(a);
                } else {
                    // This activity is before the insertion point; keep its relative index
                    a.setOrderIndex(index);
                    activityRepository.save(a);
                }
                index++;
            }
        } else {
            // Moving to a different day

            // Shift down activities on the source day that were after the moving activity
            List<Activity> sourceDayActivities = activityRepository.findByTripIdAndDayDateOrderByOrderIndex(tripId, sourceDayDate);
            int sourceIndex = 0;
            for (Activity a : sourceDayActivities) {
                if (a.getId().equals(activityId)) {
                    // Skip the moving activity; it will be updated below
                    continue;
                }
                if (a.getOrderIndex() > activity.getOrderIndex()) {
                    a.setOrderIndex(sourceIndex);
                    activityRepository.save(a);
                    sourceIndex++;
                } else {
                    a.setOrderIndex(sourceIndex);
                    activityRepository.save(a);
                    sourceIndex++;
                }
            }

            // Shift down activities on the destination day at or after the target index
            List<Activity> destDayActivities = activityRepository.findByTripIdAndDayDateOrderByOrderIndex(tripId, destDayDate);
            int destIndex = 0;
            for (Activity a : destDayActivities) {
                if (destIndex >= targetIndex) {
                    a.setOrderIndex(destIndex + 1);
                    activityRepository.save(a);
                } else {
                    a.setOrderIndex(destIndex);
                    activityRepository.save(a);
                }
                destIndex++;
            }

            // Update the moving activity's day and index
            activity.setDayDate(destDayDate);
            activity.setOrderIndex(Math.min(targetIndex, destDayActivities.size()));
        }

        activity.setUpdatedByUserId(userId);
        Activity updated = activityRepository.save(activity);

        return buildActivityResponse(updated);
    }
}
