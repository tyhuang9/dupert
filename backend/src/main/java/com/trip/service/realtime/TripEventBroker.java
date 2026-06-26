package com.trip.service.realtime;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * In-memory SSE fan-out keyed by internal trip id. This is intentionally simple
 * for v1; Piece 7 can swap the implementation for Postgres LISTEN/NOTIFY later
 * without changing controller/service call sites.
 */
@Service
public class TripEventBroker {

    static final long EMITTER_TIMEOUT_MILLIS = 30L * 60L * 1000L;
    static final int MAX_SUBSCRIBERS_PER_ACTOR_TRIP = 2;
    static final int MAX_SUBSCRIBERS_PER_IP = 32;
    static final int MAX_SUBSCRIBERS_PER_TRIP = 64;
    static final int MAX_GLOBAL_SUBSCRIBERS = 256;

    private final ConcurrentMap<Long, CopyOnWriteArrayList<Subscription>> subscriptionsByTrip =
        new ConcurrentHashMap<>();
    private int globalSubscriberCount;

    public SseEmitter subscribe(Long tripId, String actorKey, String clientIp) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MILLIS);
        String normalizedActorKey = normalizeKey(actorKey);
        String normalizedClientIp = normalizeKey(clientIp);
        Subscription subscription = new Subscription(emitter, normalizedActorKey, normalizedClientIp);

        synchronized (this) {
            CopyOnWriteArrayList<Subscription> subscriptions = subscriptionsByTrip.get(tripId);
            if (subscriptions == null) {
                subscriptions = new CopyOnWriteArrayList<>();
            }
            assertCapacity(subscriptions, normalizedActorKey, normalizedClientIp);
            subscriptions.add(subscription);
            subscriptionsByTrip.putIfAbsent(tripId, subscriptions);
            globalSubscriberCount++;
        }

        Runnable cleanup = () -> remove(tripId, subscription);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(_error -> cleanup.run());

        try {
            emitter.send(SseEmitter.event()
                .name("connected")
                .data(Map.of("type", "connected")));
        } catch (IOException | IllegalStateException ex) {
            remove(tripId, subscription);
            emitter.completeWithError(ex);
        }

        return emitter;
    }

    public void publish(Long tripId, TripEvent event) {
        CopyOnWriteArrayList<Subscription> subscriptions = subscriptionsByTrip.get(tripId);
        if (subscriptions == null || subscriptions.isEmpty()) {
            return;
        }

        for (Subscription subscription : subscriptions) {
            try {
                subscription.emitter().send(SseEmitter.event()
                    .name("trip-event")
                    .data(event));
            } catch (IOException | IllegalStateException ex) {
                remove(tripId, subscription);
                subscription.emitter().completeWithError(ex);
            }
        }
    }

    public void disconnect(Long tripId) {
        List<Subscription> subscriptions;
        synchronized (this) {
            subscriptions = subscriptionsByTrip.remove(tripId);
            if (subscriptions == null || subscriptions.isEmpty()) {
                return;
            }
            globalSubscriberCount = Math.max(0, globalSubscriberCount - subscriptions.size());
        }
        for (Subscription subscription : subscriptions) {
            subscription.emitter().complete();
        }
    }

    int subscriberCountForTest(Long tripId) {
        return subscriptionsByTrip.getOrDefault(tripId, new CopyOnWriteArrayList<>()).size();
    }

    int globalSubscriberCountForTest() {
        synchronized (this) {
            return globalSubscriberCount;
        }
    }

    private void assertCapacity(List<Subscription> subscriptions, String actorKey, String clientIp) {
        if (globalSubscriberCount >= MAX_GLOBAL_SUBSCRIBERS
                || subscriptions.size() >= MAX_SUBSCRIBERS_PER_TRIP
                || countByActor(subscriptions, actorKey) >= MAX_SUBSCRIBERS_PER_ACTOR_TRIP
                || countByClientIp(clientIp) >= MAX_SUBSCRIBERS_PER_IP) {
            throw new StreamLimitExceededException();
        }
    }

    private static long countByActor(List<Subscription> subscriptions, String actorKey) {
        return subscriptions.stream()
            .filter(subscription -> subscription.actorKey().equals(actorKey))
            .count();
    }

    private long countByClientIp(String clientIp) {
        return subscriptionsByTrip.values().stream()
            .flatMap(List::stream)
            .filter(subscription -> subscription.clientIp().equals(clientIp))
            .count();
    }

    private synchronized void remove(Long tripId, Subscription subscription) {
        CopyOnWriteArrayList<Subscription> subscriptions = subscriptionsByTrip.get(tripId);
        if (subscriptions == null) {
            return;
        }
        if (subscriptions.remove(subscription)) {
            globalSubscriberCount = Math.max(0, globalSubscriberCount - 1);
        }
        if (subscriptions.isEmpty()) {
            subscriptionsByTrip.remove(tripId, subscriptions);
        }
    }

    private static String normalizeKey(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        return key;
    }

    private record Subscription(SseEmitter emitter, String actorKey, String clientIp) {
    }

    public static class StreamLimitExceededException extends RuntimeException {
    }
}
