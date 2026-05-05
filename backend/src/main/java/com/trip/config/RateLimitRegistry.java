package com.trip.config;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import org.springframework.scheduling.annotation.Scheduled;
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
 * distinct keys seen; a scheduled sweep ({@link #evictIdle()}) drops entries that
 * have been idle longer than {@link #MAX_IDLE} so a sustained scan against many IPs
 * can't grow the map without bound.
 */
@Component
public class RateLimitRegistry {

    /**
     * Idle threshold for eviction. One hour comfortably covers the 15-minute login
     * window and the 1-hour register window — an entry older than this can't possibly
     * still be enforcing a recent limit, so dropping it just makes the next request
     * from that key lazily re-allocate a fresh bucket.
     */
    static final Duration MAX_IDLE = Duration.ofHours(1);

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

    /**
     * Bucket plus a last-access timestamp. The timestamp is updated on every
     * {@link #resolve(Named, String)} call so {@link #evictIdle()} can distinguish
     * recently-used entries from abandoned ones.
     */
    record TrackedBucket(Bucket bucket, AtomicLong lastAccessMillis) { }

    private final Map<String, TrackedBucket> buckets = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimitRegistry() {
        this(Clock.systemUTC());
    }

    /**
     * Test seam: inject a fixed/controllable clock. Production wiring uses the
     * no-arg constructor.
     */
    RateLimitRegistry(Clock clock) {
        this.clock = clock;
    }

    /**
     * Returns the bucket for {@code (name, discriminator)}, creating it on first use.
     * Callers pass something stable and scoped — e.g., {@code clientIp} — to
     * differentiate offenders while still allowing a shared pool where appropriate.
     */
    public Bucket resolve(Named name, String discriminator) {
        String key = name.name() + ":" + discriminator;
        long now = clock.millis();
        TrackedBucket tracked = buckets.computeIfAbsent(key,
            k -> new TrackedBucket(name.newBucket(), new AtomicLong(now)));
        tracked.lastAccessMillis().set(now);
        return tracked.bucket();
    }

    /**
     * Drops bucket entries that haven't been touched in {@link #MAX_IDLE}. Runs every
     * 15 minutes via Spring's scheduler (see {@link com.trip.Application}, which
     * declares {@code @EnableScheduling}). Idempotent — concurrent scans / accesses
     * just race on the {@link ConcurrentHashMap} contract.
     */
    @Scheduled(fixedDelayString = "PT15M")
    public void evictIdle() {
        long cutoff = clock.millis() - MAX_IDLE.toMillis();
        buckets.entrySet().removeIf(e -> e.getValue().lastAccessMillis().get() < cutoff);
    }

    /** Visible for tests — current entry count. */
    int size() {
        return buckets.size();
    }
}
