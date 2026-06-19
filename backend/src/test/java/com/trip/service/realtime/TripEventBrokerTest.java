package com.trip.service.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class TripEventBrokerTest {

    @Test
    void subscribeTracksEmitters() {
        TripEventBroker broker = new TripEventBroker();

        SseEmitter emitter = broker.subscribe(42L);
        assertThat(broker.subscriberCountForTest(42L)).isEqualTo(1);

        emitter.complete();
    }

    @Test
    void publishWithoutSubscribersIsNoOp() {
        TripEventBroker broker = new TripEventBroker();

        broker.publish(42L, TripEvent.noteUpdated("abc23def45gh", LocalDate.of(2026, 5, 1)));

        assertThat(broker.subscriberCountForTest(42L)).isZero();
    }

    @Test
    void disconnectRemovesTripSubscribers() {
        TripEventBroker broker = new TripEventBroker();
        broker.subscribe(42L);
        broker.subscribe(42L);

        broker.disconnect(42L);

        assertThat(broker.subscriberCountForTest(42L)).isZero();
    }
}
