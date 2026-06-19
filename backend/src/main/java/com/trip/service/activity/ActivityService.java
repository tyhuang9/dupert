package com.trip.service.activity;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.Activity;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.UserRepository;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripActor;
import com.trip.service.trip.TripAccessGuard;
import com.trip.domain.TripRole;
import com.trip.repo.GuestSessionRepository;
import com.trip.domain.GuestSession;
import com.trip.service.realtime.TripEvent;
import com.trip.service.realtime.TripEventPublisher;
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
    private final TripEventPublisher tripEventPublisher;

    public ActivityService(ActivityRepository activityRepository,
                           UserRepository userRepository,
                           GuestSessionRepository guestSessionRepository,
                           TripAccessGuard tripAccessGuard,
                           TripEventPublisher tripEventPublisher) {
        this.activityRepository = activityRepository;
        this.userRepository = userRepository;
        this.guestSessionRepository = guestSessionRepository;
        this.tripAccessGuard = tripAccessGuard;
        this.tripEventPublisher = tripEventPublisher;
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
        return createActivity(publicId, TripActor.user(userId), dayDate, request);
    }

    @Transactional
    public ActivityResponse createActivity(String publicId, TripActor actor, LocalDate dayDate,
                                           CreateActivityRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);
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
        attributeCreated(activity, actor, resolved);
        attributeUpdated(activity, actor, resolved);

        Activity saved = activityRepository.save(activity);
        tripEventPublisher.publishAfterCommit(
            tripId, TripEvent.activityCreated(publicId, saved.getId(), dayDate));
        return buildActivityResponse(saved);
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
        return listActivities(publicId, TripActor.user(userId));
    }

    @Transactional(readOnly = true)
    public List<ActivityResponse> listActivities(String publicId, TripActor actor) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActor(publicId, actor);
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
        return updateActivity(activityId, TripActor.user(userId), publicId, request);
    }

    @Transactional
    public ActivityResponse updateActivity(Long activityId, TripActor actor, String publicId,
                                           UpdateActivityRequest request) {
        // First verify access to the trip
        ResolvedTrip resolved = tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);

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

        attributeUpdated(activity, actor, resolved);
        Activity updated = activityRepository.save(activity);
        tripEventPublisher.publishAfterCommit(
            resolved.trip().getId(),
            TripEvent.activityUpdated(publicId, updated.getId(), updated.getDayDate()));

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
        deleteActivity(activityId, TripActor.user(userId), publicId);
    }

    @Transactional
    public void deleteActivity(Long activityId, TripActor actor, String publicId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);

        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new NotFoundException("activity not found: id=" + activityId));

        if (!activity.getTripId().equals(resolved.trip().getId())) {
            throw new NotFoundException(
                "activity does not belong to this trip: activityId=" + activityId);
        }

        activityRepository.delete(activity);
        tripEventPublisher.publishAfterCommit(
            resolved.trip().getId(),
            TripEvent.activityDeleted(publicId, activity.getId(), activity.getDayDate()));
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
            createdByName = guestSessionRepository.findById(activity.getCreatedByGuestSessionId())
                .map(GuestSession::getDisplayName)
                .orElse(null);
        }

        String updatedByName = null;
        if (activity.getUpdatedByUserId() != null) {
            updatedByName = userRepository.findById(activity.getUpdatedByUserId())
                .map(User::getDisplayName)
                .orElse(null);
        } else if (activity.getUpdatedByGuestSessionId() != null) {
            updatedByName = guestSessionRepository.findById(activity.getUpdatedByGuestSessionId())
                .map(GuestSession::getDisplayName)
                .orElse(null);
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
        reorderActivitiesForDay(publicId, dayDate, TripActor.user(userId), request);
    }

    @Transactional
    public void reorderActivitiesForDay(String publicId, LocalDate dayDate, TripActor actor,
                                        ReorderActivitiesRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);
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
        Set<Long> uniqueRequestedIds = new HashSet<>(requestedIds);
        if (uniqueRequestedIds.size() != requestedIds.size()) {
            throw new ValidationException("duplicate_activity_ids",
                "activityIds must not contain duplicates");
        }

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
            attributeUpdated(activity, actor, resolved);
            activityRepository.save(activity);
            nextIndex++;
        }

        // Activities not in the request are moved to the end
        for (Activity a : currentDayActivities) {
            if (!uniqueRequestedIds.contains(a.getId())) {
                a.setOrderIndex(nextIndex);
                attributeUpdated(a, actor, resolved);
                activityRepository.save(a);
                nextIndex++;
            }
        }
        tripEventPublisher.publishAfterCommit(
            tripId, TripEvent.dayReordered(publicId, dayDate));
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
        return moveActivity(activityId, TripActor.user(userId), publicId, request);
    }

    @Transactional
    public ActivityResponse moveActivity(Long activityId, TripActor actor, String publicId,
                                         MoveActivityRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);
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
            List<Activity> reordered = new ArrayList<>(dayActivities.size());
            for (Activity a : dayActivities) {
                if (!a.getId().equals(activityId)) {
                    reordered.add(a);
                }
            }

            int insertionIndex = Math.min(targetIndex, reordered.size());
            reordered.add(insertionIndex, activity);

            for (int index = 0; index < reordered.size(); index++) {
                Activity a = reordered.get(index);
                a.setOrderIndex(index);
                if (!a.getId().equals(activityId)) {
                    activityRepository.save(a);
                }
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

        attributeUpdated(activity, actor, resolved);
        Activity updated = activityRepository.save(activity);
        tripEventPublisher.publishAfterCommit(
            tripId, TripEvent.activityMoved(publicId, updated.getId(), updated.getDayDate()));

        return buildActivityResponse(updated);
    }

    private static void attributeCreated(Activity activity, TripActor actor, ResolvedTrip resolved) {
        if (actor.isUser()) {
            activity.setCreatedByUserId(actor.userId());
            activity.setCreatedByGuestSessionId(null);
        } else {
            activity.setCreatedByUserId(null);
            activity.setCreatedByGuestSessionId(resolved.guestSessionId());
        }
    }

    private static void attributeUpdated(Activity activity, TripActor actor, ResolvedTrip resolved) {
        if (actor.isUser()) {
            activity.setUpdatedByUserId(actor.userId());
            activity.setUpdatedByGuestSessionId(null);
        } else {
            activity.setUpdatedByUserId(null);
            activity.setUpdatedByGuestSessionId(resolved.guestSessionId());
        }
    }
}
