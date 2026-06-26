package com.trip.web;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;

import com.trip.config.CorrelationIdFilter;
import com.trip.service.realtime.TripEventBroker.StreamLimitExceededException;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;

import jakarta.persistence.OptimisticLockException;
import jakarta.validation.ConstraintViolationException;

/**
 * Catch-all error translator. Rules:
 * <ul>
 *   <li>Responses never include exception class names, stack traces, or request
 *       bodies. Field names are the only user-provided text we echo, and only for
 *       validation failures.</li>
 *   <li>Server-side logging is full-fidelity; clients get a correlation id and a
 *       short description. The id matches the one emitted in {@code X-Correlation-Id}
 *       so support can cross-reference logs.</li>
 *   <li>Unknown paths and unauthenticated requests collapse into the same 404/401
 *       shape Spring Security uses — see the controller-advice ordering note below.</li>
 * </ul>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<ErrorResponse.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new ErrorResponse.FieldError(
                fe.getField(),
                // Bean Validation messages are author-controlled (our own annotations),
                // not user-supplied, so surfacing them is safe.
                fe.getDefaultMessage() == null ? "invalid" : fe.getDefaultMessage()))
            .toList();
        return respond(HttpStatus.BAD_REQUEST, "validation_failed",
            "One or more fields failed validation.", fields);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException ex) {
        List<ErrorResponse.FieldError> fields = ex.getConstraintViolations().stream()
            .map(v -> new ErrorResponse.FieldError(
                lastPathNode(v.getPropertyPath().toString()),
                v.getMessage()))
            .toList();
        return respond(HttpStatus.BAD_REQUEST, "validation_failed",
            "One or more parameters failed validation.", fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException ex) {
        // Swallow the detail — "JSON parse error: Unexpected character ('x' (code 120))
        // at [Source: ...]" is noisy and potentially reflects attacker input.
        return respond(HttpStatus.BAD_REQUEST, "malformed_request",
            "Request body could not be parsed.", null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return respond(HttpStatus.BAD_REQUEST, "invalid_parameter",
            "A request parameter has the wrong type.", null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, "method_not_allowed",
            "HTTP method not supported for this endpoint.", null);
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoHandler(NoHandlerFoundException ex) {
        return respond(HttpStatus.NOT_FOUND, "not_found", "Resource not found.", null);
    }

    /**
     * Application-thrown 404. The exception's message is for logs only — the response
     * body is identical to {@link NoHandlerFoundException}'s mapping so a non-member of
     * a trip can't distinguish "doesn't exist" from "exists but I'm not on it" (see
     * PROJECT.md §5 and {@link com.trip.service.trip.TripAccessGuard}).
     */
    /**
     * Application-thrown 400 for cross-field / business-rule validation that Bean
     * Validation can't express on a single field. The slug ({@link ValidationException#slug()})
     * is the stable machine-readable code the frontend switches on; the exception's
     * message stays in logs only.
     */
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleApplicationValidation(ValidationException ex) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        log.debug("ValidationException (correlationId={}, slug={}): {}", cid, ex.slug(), ex.getMessage());
        return respond(HttpStatus.BAD_REQUEST, ex.slug(), "Request failed validation.", null);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException ex) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        log.debug("NotFound (correlationId={}): {}", cid, ex.getMessage());
        return respond(HttpStatus.NOT_FOUND, "not_found", "Resource not found.", null);
    }

    @ExceptionHandler(AuthenticationCredentialsNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUnauthenticated(AuthenticationCredentialsNotFoundException ex) {
        return respond(HttpStatus.UNAUTHORIZED, "unauthenticated", "Authentication required.", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleDenied(AccessDeniedException ex) {
        return respond(HttpStatus.FORBIDDEN, "forbidden", "Access denied.", null);
    }

    @ExceptionHandler(StreamLimitExceededException.class)
    public ResponseEntity<ErrorResponse> handleStreamLimitExceeded(StreamLimitExceededException ex) {
        return respond(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many realtime streams.", null);
    }

    /**
     * Defense-in-depth for race conditions on unique-key inserts (e.g., two concurrent
     * registrations of the same email squeak past the {@code existsBy} check). The DB
     * constraint catches the second insert; we map it to a generic 409 so the client
     * sees the same shape as the application-level conflict path.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException ex) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        // Log at WARN: a race here is rare but operationally interesting. Never include
        // the request body or any user-supplied value in the log line.
        log.warn("Data integrity violation (correlationId={}): {}", cid, ex.getClass().getSimpleName());
        return respond(HttpStatus.CONFLICT, "conflict", "Conflict with existing resource.", null);
    }

    @ExceptionHandler({ObjectOptimisticLockingFailureException.class, OptimisticLockException.class})
    public ResponseEntity<ErrorResponse> handleOptimisticLock(Exception ex) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        log.debug("Optimistic lock conflict (correlationId={}): {}", cid, ex.getClass().getSimpleName());
        return respond(HttpStatus.CONFLICT, "edit_conflict",
            "This resource changed since it was last loaded.", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        log.error("Unhandled exception (correlationId={}): {}", cid, ex.toString(), ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
            "An unexpected error occurred.", null);
    }

    private static ResponseEntity<ErrorResponse> respond(HttpStatus status,
                                                          String slug,
                                                          String message,
                                                          List<ErrorResponse.FieldError> fields) {
        String cid = MDC.get(CorrelationIdFilter.MDC_KEY);
        return ResponseEntity.status(status)
            .body(new ErrorResponse(slug, message, cid, fields));
    }

    private static String lastPathNode(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? path : path.substring(dot + 1);
    }
}
