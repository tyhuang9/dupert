package com.trip.service.auth;

/**
 * Canonicalizes user-supplied email strings before they're used as a lookup key.
 *
 * <p>Per PROJECT.md §5, the {@code users} table has a functional unique index on
 * {@code LOWER(email)}; every code path that looks up a user by email must lower-case
 * and trim first to keep the application's view consistent with the DB index.
 */
public final class EmailNormalizer {

    private EmailNormalizer() {
        // utility
    }

    /**
     * Returns the email lowercased (root locale, to avoid Turkish-locale dotted-i surprises)
     * and stripped of leading/trailing whitespace. Null input returns null so callers can
     * decide how to handle the missing case.
     */
    public static String normalize(String email) {
        if (email == null) {
            return null;
        }
        return email.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
