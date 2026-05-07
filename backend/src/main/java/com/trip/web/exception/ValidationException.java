package com.trip.web.exception;

/**
 * Thrown by services for cross-field / business-rule validation failures that Bean
 * Validation can't express on a single annotated field (e.g., {@code startDate <= endDate}
 * after a PATCH merge). The {@link #slug()} is a stable machine-readable code surfaced
 * verbatim in the response envelope (e.g., {@code "invalid_date_range"}) so the frontend
 * can switch on it. The exception's {@code message} is for logs only.
 */
public class ValidationException extends RuntimeException {

    private final String slug;

    public ValidationException(String slug, String logMessage) {
        super(logMessage);
        this.slug = slug;
    }

    public String slug() {
        return slug;
    }
}
