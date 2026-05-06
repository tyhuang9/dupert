package com.trip.service.trip;

import java.security.SecureRandom;
import java.util.Random;

import org.springframework.stereotype.Component;

/**
 * Generates 12-character random IDs for the {@code /trips/{publicId}} URL slot.
 *
 * <p>Alphabet is digits + lowercase letters MINUS the visually ambiguous characters
 * {@code 0}, {@code 1}, {@code i}, {@code l}, {@code o} — these get confused for one
 * another when users read URLs aloud or transcribe them. The remaining 31-char alphabet
 * at length 12 is roughly 59 bits of entropy, which is well within the spirit of
 * PROJECT.md §5's "unguessable in practice" requirement. The {@code publicId} is the
 * router key only, never the access capability — {@link TripAccessGuard} is what
 * actually authorizes reads and writes.
 */
@Component
public class PublicIdGenerator {

    static final String ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
    static final int LENGTH = 12;

    private final Random random;

    public PublicIdGenerator() {
        this(new SecureRandom());
    }

    /**
     * Package-private constructor for deterministic tests; production code goes through
     * the public no-arg constructor which uses {@link SecureRandom}.
     */
    PublicIdGenerator(Random random) {
        this.random = random;
    }

    public String generate() {
        char[] out = new char[LENGTH];
        for (int i = 0; i < LENGTH; i++) {
            out[i] = ALPHABET.charAt(random.nextInt(ALPHABET.length()));
        }
        return new String(out);
    }
}
