package com.trip.web.exception;

/**
 * Thrown by services to signal a 404. The message is for server-side logging only —
 * {@link com.trip.web.GlobalExceptionHandler} produces a generic sanitized envelope
 * for the HTTP response, so callers can include identifying details (e.g. the queried
 * {@code publicId}) safely without leaking them to clients.
 *
 * <p>Used by {@link com.trip.service.trip.TripAccessGuard} for both "no such trip"
 * and "caller is not a member" — collapsing both to 404 is the load-bearing piece of
 * PROJECT.md §5: a non-member must not be able to confirm whether a trip exists.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String logMessage) {
        super(logMessage);
    }
}
