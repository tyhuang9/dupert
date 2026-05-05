package com.trip.web.auth;

import java.text.Normalizer;
import java.text.Normalizer.Form;

/**
 * Cleans a user-supplied display name before it lands in the DB.
 *
 * <p>Steps, in order:
 * <ol>
 *   <li>Unicode NFC normalization — keeps "café" as one canonical sequence.</li>
 *   <li>Strip ASCII control characters ({@code &lt; 0x20} and {@code 0x7F}). These have
 *       no business in display text and {@code \0}, {@code \r}, {@code \n} are common
 *       log-injection vectors.</li>
 *   <li>Strip Unicode bidi-override codepoints ({@code U+202A}–{@code U+202E},
 *       {@code U+2066}–{@code U+2069}). Without this, an attacker can ship a name that
 *       renders as something completely different in mixed-direction UI strings — the
 *       "RIGHT-TO-LEFT OVERRIDE" trick.</li>
 *   <li>Trim leading/trailing whitespace.</li>
 * </ol>
 *
 * <p>The result may legitimately be empty if every character was stripped; callers
 * (notably {@code AuthController}) re-check non-emptiness and reject with a 400 in that
 * case.
 */
public final class DisplayNameSanitizer {

    private DisplayNameSanitizer() {
        // utility
    }

    public static String sanitize(String input) {
        if (input == null) {
            return null;
        }
        String normalized = Normalizer.normalize(input, Form.NFC);
        StringBuilder sb = new StringBuilder(normalized.length());
        int i = 0;
        while (i < normalized.length()) {
            int cp = normalized.codePointAt(i);
            int charCount = Character.charCount(cp);
            if (!shouldStrip(cp)) {
                sb.appendCodePoint(cp);
            }
            i += charCount;
        }
        return sb.toString().trim();
    }

    /**
     * True if the codepoint should be removed by sanitization. Iterating by codepoint
     * (rather than {@code char}) is what keeps this safe to extend with rules that
     * target supplementary-plane characters — the {@code char}-based version would
     * see only one half of a surrogate pair and could corrupt valid input.
     */
    private static boolean shouldStrip(int codepoint) {
        if (codepoint < 0x20 || codepoint == 0x7F) {
            return true;
        }
        if (codepoint >= 0x202A && codepoint <= 0x202E) {
            return true;
        }
        if (codepoint >= 0x2066 && codepoint <= 0x2069) {
            return true;
        }
        return false;
    }
}
