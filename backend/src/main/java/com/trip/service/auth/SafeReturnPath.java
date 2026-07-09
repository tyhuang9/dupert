package com.trip.service.auth;

import java.net.URI;

/**
 * Normalizes post-auth redirect targets to app-local relative URLs.
 */
public final class SafeReturnPath {

    public static final int MAX_LENGTH = 512;

    private SafeReturnPath() {
    }

    public static String normalize(String rawReturnPath) {
        if (rawReturnPath == null) {
            return null;
        }
        String value = rawReturnPath.trim();
        if (value.isEmpty() || value.length() > MAX_LENGTH) {
            return null;
        }
        if (!value.startsWith("/") || value.startsWith("//") || value.contains("\\")) {
            return null;
        }
        for (int i = 0; i < value.length(); i++) {
            if (Character.isISOControl(value.charAt(i))) {
                return null;
            }
        }
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("%00") || lower.contains("%0a") || lower.contains("%0d")) {
            return null;
        }
        try {
            URI uri = URI.create(value);
            if (uri.isAbsolute() || uri.getRawAuthority() != null) {
                return null;
            }
            String path = uri.getRawPath();
            return path != null && path.startsWith("/") ? value : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
