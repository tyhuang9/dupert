package com.trip.service.activity;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.Activity;
import com.trip.domain.User;
import com.trip.domain.Trip;
import com.trip.repo.ActivityRepository;
import com.trip.repo.IdDisplayName;
import com.trip.repo.TripRepository;
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
    private final TripRepository tripRepository;
    private final UserRepository userRepository;
    private final GuestSessionRepository guestSessionRepository;
    private final TripAccessGuard tripAccessGuard;
    private final TripEventPublisher tripEventPublisher;

    public ActivityService(ActivityRepository activityRepository,
                           TripRepository tripRepository,
                           UserRepository userRepository,
                           GuestSessionRepository guestSessionRepository,
                           TripAccessGuard tripAccessGuard,
                           TripEventPublisher tripEventPublisher) {
        this.activityRepository = activityRepository;
        this.tripRepository = tripRepository;
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
        ResolvedTrip resolved = lockTripForActivityWrite(
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR));
        Long tripId = resolved.trip().getId();

        validateActivityBucketDay(dayDate, resolved);

        // Enforce resource cap
        long count = activityRepository.countByTripId(tripId);
        if (count >= MAX_ACTIVITIES_PER_TRIP) {
            throw new ValidationException("activity_limit_exceeded",
                "Trip has reached the maximum number of activities");
        }

        // Compute the next order index for this day or Ideas bucket.
        int maxIndex = maxOrderIndexForBucket(tripId, dayDate);
        int nextIndex = maxIndex + 1;

        // Create the activity
        Activity activity = new Activity(tripId, dayDate, request.category(), request.title());
        activity.setNotes(request.notes());
        activity.setStartTime(request.startTime());
        activity.setEndTime(request.endTime());
        activity.setPlaceId(request.placeId());
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

        List<Activity> activities = activityRepository.findAllVisibleForTrip(
            tripId,
            resolved.trip().getStartDate(),
            resolved.trip().getEndDate());
        AttributionNames attributionNames = loadAttributionNames(activities);

        return activities.stream()
            .map(activity -> buildActivityResponse(activity, attributionNames))
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
        return updateActivity(activityId, actor, publicId, request, populatedUpdateFields(request));
    }

    @Transactional
    public ActivityResponse updateActivity(Long activityId, TripActor actor, String publicId,
                                           UpdateActivityRequest request,
                                           Set<String> providedFields) {
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
        if (providedFields.contains("notes")) {
            activity.setNotes(request.notes());
        }
        if (providedFields.contains("startTime")) {
            activity.setStartTime(request.startTime());
        }
        if (providedFields.contains("endTime")) {
            activity.setEndTime(request.endTime());
        }
        if (providedFields.contains("placeId")) {
            activity.setPlaceId(request.placeId());
        }
        if (providedFields.contains("placeName")) {
            activity.setPlaceName(request.placeName());
        }
        if (providedFields.contains("address")) {
            activity.setAddress(request.address());
        }
        if (providedFields.contains("lat")) {
            activity.setLat(request.lat());
        }
        if (providedFields.contains("lng")) {
            activity.setLng(request.lng());
        }

        attributeUpdated(activity, actor, resolved);
        Activity updated = activityRepository.save(activity);
        tripEventPublisher.publishAfterCommit(
            resolved.trip().getId(),
            TripEvent.activityUpdated(publicId, updated.getId(), updated.getDayDate()));

        return buildActivityResponse(updated);
    }

    private static Set<String> populatedUpdateFields(UpdateActivityRequest request) {
        Set<String> fields = new HashSet<>();
        if (request.category() != null) {
            fields.add("category");
        }
        if (request.title() != null) {
            fields.add("title");
        }
        if (request.notes() != null) {
            fields.add("notes");
        }
        if (request.startTime() != null) {
            fields.add("startTime");
        }
        if (request.endTime() != null) {
            fields.add("endTime");
        }
        if (request.placeId() != null) {
            fields.add("placeId");
        }
        if (request.placeName() != null) {
            fields.add("placeName");
        }
        if (request.address() != null) {
            fields.add("address");
        }
        if (request.lat() != null) {
            fields.add("lat");
        }
        if (request.lng() != null) {
            fields.add("lng");
        }
        return fields;
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
        ResolvedTrip resolved = lockTripForActivityWrite(
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR));

        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new NotFoundException("activity not found: id=" + activityId));

        if (!activity.getTripId().equals(resolved.trip().getId())) {
            throw new NotFoundException(
                "activity does not belong to this trip: activityId=" + activityId);
        }

        List<Activity> remainingActivities = activitiesForBucket(
            resolved.trip().getId(), activity.getDayDate()).stream()
            .filter(candidate -> !candidate.getId().equals(activityId))
            .collect(java.util.stream.Collectors.toCollection(ArrayList::new));

        activityRepository.delete(activity);
        // Release the removed position before assigning the remaining final positions.
        activityRepository.flush();
        reindexBuckets(List.of(new ActivityBucket(activity.getDayDate(), remainingActivities)), actor, resolved);
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
     * Resolves every actor referenced by an activity list in two bounded, narrow queries
     * (one for users and one for guests), instead of looking up up to two actors per row.
     */
    private AttributionNames loadAttributionNames(List<Activity> activities) {
        Set<Long> userIds = new HashSet<>();
        Set<Long> guestSessionIds = new HashSet<>();
        for (Activity activity : activities) {
            addIfPresent(userIds, activity.getCreatedByUserId());
            addIfPresent(userIds, activity.getUpdatedByUserId());
            addIfPresent(guestSessionIds, activity.getCreatedByGuestSessionId());
            addIfPresent(guestSessionIds, activity.getUpdatedByGuestSessionId());
        }

        return new AttributionNames(
            displayNamesById(userIds, userRepository::findDisplayNamesByIdIn),
            displayNamesById(guestSessionIds, guestSessionRepository::findDisplayNamesByIdIn));
    }

    private static void addIfPresent(Set<Long> ids, Long id) {
        if (id != null) {
            ids.add(id);
        }
    }

    private static Map<Long, String> displayNamesById(
        Set<Long> ids, Function<Set<Long>, List<IdDisplayName>> displayNameLookup) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return displayNameLookup.apply(ids).stream()
            .collect(Collectors.toMap(IdDisplayName::id, IdDisplayName::displayName, (first, ignored) -> first,
                HashMap::new));
    }

    private static ActivityResponse buildActivityResponse(Activity activity, AttributionNames attributionNames) {
        String createdByName = null;
        if (activity.getCreatedByUserId() != null) {
            createdByName = attributionNames.userDisplayNames().get(activity.getCreatedByUserId());
        } else if (activity.getCreatedByGuestSessionId() != null) {
            createdByName = attributionNames.guestDisplayNames().get(activity.getCreatedByGuestSessionId());
        }

        String updatedByName = null;
        if (activity.getUpdatedByUserId() != null) {
            updatedByName = attributionNames.userDisplayNames().get(activity.getUpdatedByUserId());
        } else if (activity.getUpdatedByGuestSessionId() != null) {
            updatedByName = attributionNames.guestDisplayNames().get(activity.getUpdatedByGuestSessionId());
        }
        return ActivityResponse.of(activity, createdByName, updatedByName);
    }

    private record AttributionNames(Map<Long, String> userDisplayNames,
                                    Map<Long, String> guestDisplayNames) {
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
        ResolvedTrip resolved = lockTripForActivityWrite(
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR));
        validateActivityBucketDay(dayDate, resolved);
        reorderActivitiesInBucket(publicId, dayDate, actor, resolved, request);
    }

    /**
     * Reorder no-day Ideas.
     */
    @Transactional
    public void reorderIdeas(String publicId, Long userId, ReorderActivitiesRequest request) {
        reorderIdeas(publicId, TripActor.user(userId), request);
    }

    @Transactional
    public void reorderIdeas(String publicId, TripActor actor, ReorderActivitiesRequest request) {
        ResolvedTrip resolved = lockTripForActivityWrite(
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR));
        reorderActivitiesInBucket(publicId, null, actor, resolved, request);
    }

    private void reorderActivitiesInBucket(String publicId, LocalDate dayDate, TripActor actor,
                                           ResolvedTrip resolved, ReorderActivitiesRequest request) {
        Long tripId = resolved.trip().getId();
        List<Activity> currentActivities = activitiesForBucket(tripId, dayDate);

        var requestedIds = request.activityIds();
        Set<Long> uniqueRequestedIds = new HashSet<>(requestedIds);
        if (uniqueRequestedIds.size() != requestedIds.size()) {
            throw new ValidationException("duplicate_activity_ids",
                "activityIds must not contain duplicates");
        }

        var activityById = new java.util.HashMap<Long, Activity>();
        for (Activity activity : currentActivities) {
            activityById.put(activity.getId(), activity);
        }

        for (Long id : requestedIds) {
            if (!activityById.containsKey(id)) {
                throw new ValidationException("activity_not_found_for_day",
                    "Activity id=" + id + " does not belong to trip=" + tripId + " "
                        + bucketDescription(dayDate));
            }
        }

        List<Activity> reorderedActivities = new ArrayList<>(currentActivities.size());
        for (Long id : requestedIds) {
            reorderedActivities.add(activityById.get(id));
        }

        for (Activity activity : currentActivities) {
            if (!uniqueRequestedIds.contains(activity.getId())) {
                reorderedActivities.add(activity);
            }
        }
        reindexBuckets(List.of(new ActivityBucket(dayDate, reorderedActivities)), actor, resolved);
        tripEventPublisher.publishAfterCommit(
            tripId, TripEvent.dayReordered(publicId, dayDate));
    }

    private void validateActivityBucketDay(LocalDate dayDate, ResolvedTrip resolved) {
        if (dayDate == null) {
            return;
        }
        if (dayDate.isBefore(resolved.trip().getStartDate()) ||
            dayDate.isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }
    }

    private List<Activity> activitiesForBucket(Long tripId, LocalDate dayDate) {
        return dayDate == null
            ? activityRepository.findByTripIdAndDayDateIsNullOrderByOrderIndex(tripId)
            : activityRepository.findByTripIdAndDayDateOrderByOrderIndex(tripId, dayDate);
    }

    private int maxOrderIndexForBucket(Long tripId, LocalDate dayDate) {
        return dayDate == null
            ? activityRepository.findMaxOrderIndexForIdeas(tripId)
            : activityRepository.findMaxOrderIndexForDay(tripId, dayDate);
    }

    /**
     * Reindexes complete buckets in two database-visible phases. The migration establishes
     * non-negative canonical positions, so the distinct negative staging positions cannot
     * collide with existing rows. Flushing before final positions makes the partial unique
     * indexes safe regardless of Hibernate's update ordering.
     */
    private void reindexBuckets(List<ActivityBucket> buckets, TripActor actor, ResolvedTrip resolved) {
        if (buckets.stream().allMatch(bucket -> bucket.activities().isEmpty())) {
            return;
        }

        for (ActivityBucket bucket : buckets) {
            for (int index = 0; index < bucket.activities().size(); index++) {
                Activity activity = bucket.activities().get(index);
                activity.setDayDate(bucket.dayDate());
                activity.setOrderIndex(-(index + 1));
                attributeUpdated(activity, actor, resolved);
                activityRepository.save(activity);
            }
        }
        activityRepository.flush();

        for (ActivityBucket bucket : buckets) {
            for (int index = 0; index < bucket.activities().size(); index++) {
                Activity activity = bucket.activities().get(index);
                activity.setDayDate(bucket.dayDate());
                activity.setOrderIndex(index);
                attributeUpdated(activity, actor, resolved);
                activityRepository.save(activity);
            }
        }
    }

    private ResolvedTrip lockTripForActivityWrite(ResolvedTrip resolved) {
        Trip lockedTrip = tripRepository.findByIdForUpdate(resolved.trip().getId())
            .orElseThrow(() -> new NotFoundException("trip not found: id=" + resolved.trip().getId()));
        return new ResolvedTrip(lockedTrip, resolved.role(), resolved.guestSessionId());
    }

    private record ActivityBucket(LocalDate dayDate, List<Activity> activities) {
    }

    private static String bucketDescription(LocalDate dayDate) {
        return dayDate == null ? "Ideas" : "day=" + dayDate;
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
        ResolvedTrip resolved = lockTripForActivityWrite(
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR));
        Long tripId = resolved.trip().getId();

        validateActivityBucketDay(request.dayDate(), resolved);

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

        List<Activity> sourceActivities = activitiesForBucket(tripId, sourceDayDate).stream()
            .filter(a -> !a.getId().equals(activityId))
            .collect(java.util.stream.Collectors.toCollection(ArrayList::new));

        List<Activity> destActivities = Objects.equals(sourceDayDate, destDayDate)
            ? sourceActivities
            : activitiesForBucket(tripId, destDayDate).stream()
                .filter(a -> !a.getId().equals(activityId))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        int insertionIndex = Math.max(0, Math.min(targetIndex, destActivities.size()));
        destActivities.add(insertionIndex, activity);
        List<ActivityBucket> buckets = Objects.equals(sourceDayDate, destDayDate)
            ? List.of(new ActivityBucket(destDayDate, destActivities))
            : List.of(
                new ActivityBucket(sourceDayDate, sourceActivities),
                new ActivityBucket(destDayDate, destActivities));
        reindexBuckets(buckets, actor, resolved);

        Activity updated = activity;
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
