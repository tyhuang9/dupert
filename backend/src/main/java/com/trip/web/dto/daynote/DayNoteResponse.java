package com.trip.web.dto.daynote;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.trip.domain.DayNote;

/**
 * Public view of a {@link DayNote} for API responses.
 *
 * <p>Notes are keyed by trip and date; there's no separate numeric id. The response includes
 * the trip id and day date for context, along with the note text and audit metadata.
 *
 * <p>{@code updatedByUserDisplayName} is populated by the service layer; audit fields like
 * {@code updatedByUserId} are internal and not returned to the client.
 */
public record DayNoteResponse(
    long tripId,
    LocalDate dayDate,
    String note,
    String updatedByUserDisplayName,
    OffsetDateTime updatedAt,
    long version
) {

    public static DayNoteResponse of(DayNote dayNote, String updatedByUserDisplayName) {
        return new DayNoteResponse(
            dayNote.getId().getTripId(),
            dayNote.getId().getDayDate(),
            dayNote.getNote(),
            updatedByUserDisplayName,
            dayNote.getUpdatedAt(),
            dayNote.getVersion()
        );
    }
}
