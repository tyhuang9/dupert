package com.trip.web;

import java.util.List;

/**
 * Uniform error envelope returned by {@link GlobalExceptionHandler}. Intentionally
 * minimal — no stack traces, no exception class names, no reflected field values
 * beyond the field name itself (for 400s).
 *
 * @param error          machine-readable slug (e.g., {@code "validation_failed"})
 * @param message        safe, human-readable summary
 * @param correlationId  short id matching {@code X-Correlation-Id} for log lookup
 * @param fieldErrors    per-field messages for validation failures; {@code null} otherwise
 */
public record ErrorResponse(
    String error,
    String message,
    String correlationId,
    List<FieldError> fieldErrors
) {

    public record FieldError(String field, String message) {
    }
}
