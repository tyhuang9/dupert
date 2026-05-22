package com.trip.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.trip.service.daynote.DayNoteService;
import com.trip.web.dto.daynote.DayNoteResponse;
import com.trip.web.dto.daynote.UpdateDayNoteRequest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

/**
 * HTTP surface for day note operations. All endpoints require an authenticated principal.
 *
 * <p>Per-trip access is enforced inside {@link DayNoteService} via
 * {@link com.trip.service.trip.TripAccessGuard}. Non-members receive 404.
 *
 * <p>Reading notes requires VIEW access (any role). Writing notes (update/upsert)
 * requires EDITOR role.
 */
@RestController
@RequestMapping("/api")
@Validated
public class DayNoteController {

    static final String PUBLIC_ID_PATTERN = "[a-z0-9]{1,24}";

    private final DayNoteService dayNoteService;

    public DayNoteController(DayNoteService dayNoteService) {
        this.dayNoteService = dayNoteService;
    }

    /**
     * Retrieve the note for a specific day of a trip.
     *
     * <p>Endpoint: {@code GET /api/trips/{publicId}/notes/{date}}
     *
     * <p>If no note has been written yet, returns an empty note. The response still includes
     * {@code updatedAt} and {@code version} for frontend-side optimistic locking awareness.
     *
     * @param publicId the trip's public id
     * @param dayDate the date (ISO format)
     * @param authentication the authenticated user
     * @return 200 with the day note
     */
    @GetMapping("/trips/{publicId}/notes/{dayDate}")
    public ResponseEntity<DayNoteResponse> getDayNote(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable LocalDate dayDate,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        DayNoteResponse note = dayNoteService.getDayNote(publicId, dayDate, userId);
        return ResponseEntity.ok(note);
    }

    /**
     * Retrieve all notes for a trip.
     *
     * <p>Endpoint: {@code GET /api/trips/{publicId}/notes}
     *
     * @param publicId the trip's public id
     * @param authentication the authenticated user
     * @return 200 with list of day notes
     */
    @GetMapping("/trips/{publicId}/notes")
    public ResponseEntity<List<DayNoteResponse>> listDayNotes(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        List<DayNoteResponse> notes = dayNoteService.listDayNotes(publicId, userId);
        return ResponseEntity.ok(notes);
    }

    /**
     * Create or update a day note (idempotent upsert).
     *
     * <p>Endpoint: {@code PUT /api/trips/{publicId}/notes/{date}}
     *
     * <p>Uses HTTP PUT for idempotent upsert semantics: if a note doesn't exist, it's created;
     * if it does, it's updated. The entire request body is authoritative (no partial updates).
     *
     * @param publicId the trip's public id
     * @param dayDate the date (ISO format)
     * @param body the note content
     * @param authentication the authenticated user
     * @return 200 with the updated day note
     */
    @PutMapping("/trips/{publicId}/notes/{dayDate}")
    public ResponseEntity<DayNoteResponse> updateDayNote(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable LocalDate dayDate,
            @Valid @RequestBody UpdateDayNoteRequest body,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        DayNoteResponse updated = dayNoteService.updateDayNote(publicId, dayDate, userId, body);
        return ResponseEntity.ok(updated);
    }

    /**
     * Extract and validate the user id from the authentication principal.
     */
    private static Long requireUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
                "no authenticated principal");
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long id) {
            return id;
        }
        throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
            "principal is not a user id");
    }
}
