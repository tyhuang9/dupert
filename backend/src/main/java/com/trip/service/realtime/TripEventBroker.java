package com.trip.service.realtime;

import java.io.IOException;
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

    private final ConcurrentMap<Long, CopyOnWriteArrayList<SseEmitter>> emittersByTrip =
        new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long tripId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MILLIS);
        emittersByTrip.computeIfAbsent(tripId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> remove(tripId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(_error -> cleanup.run());

        try {
            emitter.send(SseEmitter.event()
                .name("connected")
                .data(Map.of("type", "connected")));
        } catch (IOException | IllegalStateException ex) {
            remove(tripId, emitter);
            emitter.completeWithError(ex);
        }

        return emitter;
    }

    public void publish(Long tripId, TripEvent event) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByTrip.get(tripId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                    .name("trip-event")
                    .data(event));
            } catch (IOException | IllegalStateException ex) {
                remove(tripId, emitter);
                emitter.completeWithError(ex);
            }
        }
    }

    public void disconnect(Long tripId) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByTrip.remove(tripId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            emitter.complete();
        }
    }

    int subscriberCountForTest(Long tripId) {
        return emittersByTrip.getOrDefault(tripId, new CopyOnWriteArrayList<>()).size();
    }

    private void remove(Long tripId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByTrip.get(tripId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByTrip.remove(tripId, emitters);
        }
    }
}
