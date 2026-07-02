package com.trip.web;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.service.activity.ActivityService;
import com.trip.web.dto.activity.ActivityResponse;
import com.trip.web.dto.activity.CreateActivityRequest;
import com.trip.web.dto.activity.UpdateActivityRequest;
import com.trip.web.dto.activity.MoveActivityRequest;
import com.trip.web.dto.activity.ReorderActivitiesRequest;
import com.trip.web.auth.AuthenticationActors;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Pattern;

/**
 * HTTP surface for activity CRUD. All endpoints require an authenticated principal.
 *
 * <p>Per-trip access is enforced inside {@link ActivityService} via
 * {@link com.trip.service.trip.TripAccessGuard}. Non-members and members with
 * insufficient role both receive 404 — never 403. IDOR checks ensure an activity's
 * {@code trip_id} is verified to belong to an accessible trip.
 *
 * <p>Activity creation, update, and deletion require EDITOR role. Listing requires
 * only VIEW access (any role, including VIEWER).
 */
@RestController
@RequestMapping("/api")
@Validated
public class ActivityController {

    static final String PUBLIC_ID_PATTERN = "[a-z0-9]{1,24}";

    private final ActivityService activityService;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public ActivityController(ActivityService activityService,
                              ObjectMapper objectMapper,
                              Validator validator) {
        this.activityService = activityService;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    /**
     * Create an activity on a specific day of a trip.
     *
     * <p>Endpoint: {@code POST /api/trips/{publicId}/activities?dayDate=2026-05-01}
     *
     * @param publicId the trip's public id
     * @param dayDate the date to add the activity to (ISO format)
     * @param body the activity details
     * @param authentication the authenticated user
     * @return 201 with the created activity
     */
    @PostMapping("/trips/{publicId}/activities")
    public ResponseEntity<ActivityResponse> createActivity(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @RequestParam(name = "dayDate", required = false) LocalDate dayDate,
            @Valid @RequestBody CreateActivityRequest body,
            Authentication authentication) {
        ActivityResponse created = activityService.createActivity(
            publicId, AuthenticationActors.requireTripActor(authentication), dayDate, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Retrieve all activities for a trip.
     *
     * <p>Endpoint: {@code GET /api/trips/{publicId}/activities}
     *
     * @param publicId the trip's public id
     * @param authentication the authenticated user
     * @return 200 with list of activities
     */
    @GetMapping("/trips/{publicId}/activities")
    public ResponseEntity<List<ActivityResponse>> listActivities(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        List<ActivityResponse> activities = activityService.listActivities(
            publicId, AuthenticationActors.requireTripActor(authentication));
        return ResponseEntity.ok(activities);
    }

    /**
     * Update an activity.
     *
     * <p>Endpoint: {@code PATCH /api/trips/{publicId}/activities/{activityId}}
     *
     * <p>Omitted fields in the request body are not updated; only provided fields are
     * applied. This endpoint does not move the activity to a different day (see
     * {@code POST /api/activities/{id}/move} for cross-day moves).
     *
     * @param publicId the trip's public id (used for access check)
     * @param activityId the activity's id
     * @param body the updates (all fields optional)
     * @param authentication the authenticated user
     * @return 200 with the updated activity
     */
    @PatchMapping("/trips/{publicId}/activities/{activityId}")
    public ResponseEntity<ActivityResponse> updateActivity(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable long activityId,
            @RequestBody Map<String, JsonNode> body,
            Authentication authentication) {
        UpdateActivityRequest request = objectMapper.convertValue(body, UpdateActivityRequest.class);
        Set<ConstraintViolation<UpdateActivityRequest>> violations = validator.validate(request);
        if (!violations.isEmpty()) {
            throw new ConstraintViolationException(violations);
        }
        ActivityResponse updated = activityService.updateActivity(
            activityId,
            AuthenticationActors.requireTripActor(authentication),
            publicId,
            request,
            body.keySet());
        return ResponseEntity.ok(updated);
    }

    /**
     * Delete an activity.
     *
     * <p>Endpoint: {@code DELETE /api/trips/{publicId}/activities/{activityId}}
     *
     * @param publicId the trip's public id (used for access check)
     * @param activityId the activity's id
     * @param authentication the authenticated user
     * @return 204 No Content
     */
    @DeleteMapping("/trips/{publicId}/activities/{activityId}")
    public ResponseEntity<Void> deleteActivity(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable long activityId,
            Authentication authentication) {
        activityService.deleteActivity(
            activityId, AuthenticationActors.requireTripActor(authentication), publicId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Reorder activities within a single day.
     *
     * <p>Endpoint: {@code POST /api/trips/{publicId}/days/{date}/order}
     *
     * <p>The request body contains a list of activity IDs in the desired order.
     * All activities in the list must belong to the specified day. Activities not
     * in the list are moved to the end.
     *
     * @param publicId the trip's public id
     * @param dayDate the date whose activities are being reordered (ISO format)
     * @param body the reorder request
     * @param authentication the authenticated user
     * @return 204 No Content
     */
    @PostMapping("/trips/{publicId}/days/{dayDate}/order")
    public ResponseEntity<Void> reorderActivitiesForDay(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable LocalDate dayDate,
            @Valid @RequestBody ReorderActivitiesRequest body,
            Authentication authentication) {
        activityService.reorderActivitiesForDay(
            publicId, dayDate, AuthenticationActors.requireTripActor(authentication), body);
        return ResponseEntity.noContent().build();
    }

    /**
     * Reorder no-day Ideas.
     *
     * <p>Endpoint: {@code POST /api/trips/{publicId}/ideas/order}
     *
     * @param publicId the trip's public id
     * @param body the reorder request
     * @param authentication the authenticated user
     * @return 204 No Content
     */
    @PostMapping("/trips/{publicId}/ideas/order")
    public ResponseEntity<Void> reorderIdeas(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @Valid @RequestBody ReorderActivitiesRequest body,
            Authentication authentication) {
        activityService.reorderIdeas(
            publicId, AuthenticationActors.requireTripActor(authentication), body);
        return ResponseEntity.noContent().build();
    }

    /**
     * Move an activity to a different day and/or reorder it.
     *
     * <p>Endpoint: {@code POST /api/activities/{id}/move}
     *
     * @param activityId the activity's id
     * @param body the move request (destination day and order index)
     * @param authentication the authenticated user
     * @return 200 with the updated activity
     */
    @PostMapping("/activities/{id}/move")
    public ResponseEntity<ActivityResponse> moveActivity(
            @PathVariable(name = "id") long activityId,
            @RequestParam @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @Valid @RequestBody MoveActivityRequest body,
            Authentication authentication) {
        ActivityResponse updated = activityService.moveActivity(
            activityId, AuthenticationActors.requireTripActor(authentication), publicId, body);
        return ResponseEntity.ok(updated);
    }
}
