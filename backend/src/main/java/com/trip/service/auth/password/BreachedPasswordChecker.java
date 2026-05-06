package com.trip.service.auth.password;

/**
 * Checks whether a candidate password appears in a known-breach corpus.
 *
 * <p><b>Fail-open contract.</b> Implementations that depend on a remote service (e.g. HIBP)
 * MUST return {@code false} ("not breached") on timeout, network failure, or any non-2xx
 * response from the upstream. Registration is a user-facing flow and a third-party outage
 * must never block legitimate sign-ups; the rest of the password policy (length, letter +
 * digit, bcrypt cost 12, rate limits) carries the security weight in those moments. A
 * warning should be logged with correlation context, but never the password, the full
 * SHA-1 hash, or any user-identifying value.
 */
public interface BreachedPasswordChecker {

    /**
     * Returns {@code true} iff the password is known to be breached and exceeds the
     * configured appearance threshold. Returns {@code false} on any failure mode
     * (fail-open).
     */
    boolean isBreached(String password);
}
