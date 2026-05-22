package com.trip.web.dto.daynote;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body for creating or updating a day note ({@code PUT /api/trips/{publicId}/notes/{date}}).
 *
 * <p>Day notes use the HTTP PUT verb for idempotent upsert semantics: if a note doesn't exist,
 * it's created; if it does, it's updated. The note text itself is the only writable field.
 *
 * <p>{@code note} may be an empty string, which is equivalent to clearing the note.
 * The database stores it as {@code NOT NULL DEFAULT ''}, so an empty note is valid.
 *
 * <p>Validation is minimal; the service layer handles sanitization.
 */
public record UpdateDayNoteRequest(
    @NotNull(message = "note is required")
    @Size(max = 5000, message = "note must not exceed 5000 characters")
    String note
) {
}
