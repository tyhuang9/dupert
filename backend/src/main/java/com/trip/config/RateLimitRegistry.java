package com.trip.config;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;

/**
 * Central registry of named rate-limit buckets (Bucket4j, in-memory).
 *
 * <p>Piece 1 only wires the infrastructure and registers the bucket <em>definitions</em>
 * the plan calls out ({@code auth-login}, {@code auth-register}, {@code share-accept},
 * {@code guest-write}). Piece 2+ will consume them from filters / interceptors on
 * the actual endpoints. Until then, {@link RateLimitFilter} is a no-op pass-through,
 * so this class also has no runtime effect — but the configuration lives here so
 * wiring an endpoint later is a one-liner.
 *
 * <p>Keys are {@code "{bucketName}:{discriminator}"}, where the discriminator is
 * typically {@code ip} or {@code ip:email}. The map is lock-free and bounded only by
 * distinct keys seen; a scheduled eviction pass can be added in Piece 2 if needed.
 */
@Component
public class RateLimitRegistry {

    /**
     * Definitions of the named buckets. All values mirror §5 of the plan. Each is a
     * {@link Supplier} so a fresh {@link Bucket} is built per key.
     */
    public enum Named {
        /** 5 login attempts per 15 minutes. */
        AUTH_LOGIN(() -> Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(5).refillGreedy(5, Duration.ofMinutes(15)).build())
            .build()),

        /** 10 registrations per hour per IP. */
        AUTH_REGISTER(() -> Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(10).refillGreedy(10, Duration.ofHours(1)).build())
            .build()),

        /** 10 share-accept attempts per minute per (ip, token). */
        SHARE_ACCEPT(() -> Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(10).refillGreedy(10, Duration.ofMinutes(1)).build())
            .build()),

        /** 60 writes per minute per guest session. */
        GUEST_WRITE(() -> Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(60).refillGreedy(60, Duration.ofMinutes(1)).build())
            .build());

        private final Supplier<Bucket> factory;

        Named(Supplier<Bucket> factory) {
            this.factory = factory;
        }

        Bucket newBucket() {
            return factory.get();
        }
    }

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * Returns the bucket for {@code (name, discriminator)}, creating it on first use.
     * Callers pass something stable and scoped — e.g., {@code clientIp} — to
     * differentiate offenders while still allowing a shared pool where appropriate.
     */
    public Bucket resolve(Named name, String discriminator) {
        String key = name.name() + ":" + discriminator;
        return buckets.computeIfAbsent(key, k -> name.newBucket());
    }
}
