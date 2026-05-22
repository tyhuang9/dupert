package com.trip.service.daynote;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.DayNote;
import com.trip.domain.User;
import com.trip.repo.DayNoteRepository;
import com.trip.repo.UserRepository;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.domain.TripRole;
import com.trip.web.dto.daynote.DayNoteResponse;
import com.trip.web.dto.daynote.UpdateDayNoteRequest;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;

/**
 * Day note operations. All per-trip access is gated through
 * {@link TripAccessGuard} to enforce the access invariant (PROJECT.md §5).
 *
 * <p>Editors can write day notes; viewers can only read them. Each day in a trip
 * has at most one note. The note is stored as a {@code NOT NULL DEFAULT ''} string,
 * so an empty note is valid and is equivalent to "no note".
 *
 * <p>Day note responses include {@code updatedByUserDisplayName}, populated by the
 * service layer. A null name means the last updater was a guest (guest display names
 * are not persisted in the day_note row).
 */
@Service
public class DayNoteService {

    private final DayNoteRepository dayNoteRepository;
    private final UserRepository userRepository;
    private final TripAccessGuard tripAccessGuard;

    public DayNoteService(DayNoteRepository dayNoteRepository,
                          UserRepository userRepository,
                          TripAccessGuard tripAccessGuard) {
        this.dayNoteRepository = dayNoteRepository;
        this.userRepository = userRepository;
        this.tripAccessGuard = tripAccessGuard;
    }

    /**
     * Retrieve the note for a specific day of a trip. Requires any role (VIEW access).
     *
     * @param publicId the trip's public id
     * @param dayDate the date to retrieve the note for
     * @param userId the authenticated user's id
     * @return the day note with attribution
     * @throws NotFoundException if the trip doesn't exist or the user is not a member
     * @throws ValidationException if the date is outside the trip's date range
     */
    @Transactional(readOnly = true)
    public DayNoteResponse getDayNote(String publicId, LocalDate dayDate, Long userId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUser(publicId, userId);

        // Validate the day is within the trip's date range
        if (dayDate.isBefore(resolved.trip().getStartDate()) ||
            dayDate.isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }

        // Fetch or create a default note
        Long tripId = resolved.trip().getId();
        DayNote dayNote = dayNoteRepository.findById_TripIdAndId_DayDate(tripId, dayDate)
            .orElseGet(() -> new DayNote(tripId, dayDate, ""));

        String updatedByName = null;
        if (dayNote.getUpdatedByUserId() != null) {
            updatedByName = userRepository.findById(dayNote.getUpdatedByUserId())
                .map(User::getDisplayName)
                .orElse(null);
        }

        return DayNoteResponse.of(dayNote, updatedByName);
    }

    /**
     * Retrieve all notes for a trip within its date range.
     *
     * @param publicId the trip's public id
     * @param userId the authenticated user's id
     * @return list of day notes
     * @throws NotFoundException if the trip doesn't exist or the user is not a member
     */
    @Transactional(readOnly = true)
    public List<DayNoteResponse> listDayNotes(String publicId, Long userId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUser(publicId, userId);
        Long tripId = resolved.trip().getId();

        List<DayNote> notes = dayNoteRepository.findAllInDateRange(
            tripId,
            resolved.trip().getStartDate(),
            resolved.trip().getEndDate());

        return notes.stream()
            .map(n -> buildDayNoteResponse(n))
            .toList();
    }

    /**
     * Create or update a day note (idempotent upsert). Requires EDITOR role.
     *
     * @param publicId the trip's public id
     * @param dayDate the date to set the note for
     * @param userId the authenticated user's id
     * @param request the note text
     * @return the updated day note
     * @throws NotFoundException if the trip doesn't exist or the user is not a member
     * @throws ValidationException if the date is outside the trip's date range
     */
    @Transactional
    public DayNoteResponse updateDayNote(String publicId, LocalDate dayDate, Long userId,
                                         UpdateDayNoteRequest request) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);

        // Validate the day is within the trip's date range
        if (dayDate.isBefore(resolved.trip().getStartDate()) ||
            dayDate.isAfter(resolved.trip().getEndDate())) {
            throw new ValidationException("day_out_of_range",
                "dayDate must fall within the trip's startDate and endDate");
        }

        Long tripId = resolved.trip().getId();
        DayNote dayNote = dayNoteRepository.findById_TripIdAndId_DayDate(tripId, dayDate)
            .orElseGet(() -> new DayNote(tripId, dayDate, ""));

        dayNote.setNote(request.note());
        dayNote.setUpdatedByUserId(userId);

        DayNote saved = dayNoteRepository.save(dayNote);
        return buildDayNoteResponse(saved);
    }

    /**
     * Helper to build a {@link DayNoteResponse} with display name populated.
     */
    private DayNoteResponse buildDayNoteResponse(DayNote dayNote) {
        String updatedByName = null;
        if (dayNote.getUpdatedByUserId() != null) {
            updatedByName = userRepository.findById(dayNote.getUpdatedByUserId())
                .map(User::getDisplayName)
                .orElse(null);
        }
        return DayNoteResponse.of(dayNote, updatedByName);
    }
}
