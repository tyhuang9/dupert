package com.trip.service.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class TripEventBrokerTest {

    @Test
    void subscribeTracksEmitters() {
        TripEventBroker broker = new TripEventBroker();

        SseEmitter emitter = broker.subscribe(42L, "user:1", "203.0.113.10");
        assertThat(broker.subscriberCountForTest(42L)).isEqualTo(1);
        assertThat(broker.globalSubscriberCountForTest()).isEqualTo(1);

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
        broker.subscribe(42L, "user:1", "203.0.113.10");
        broker.subscribe(42L, "user:1", "203.0.113.10");

        broker.disconnect(42L);

        assertThat(broker.subscriberCountForTest(42L)).isZero();
        assertThat(broker.globalSubscriberCountForTest()).isZero();
    }

    @Test
    void limitsSubscriptionsPerActorAndTrip() {
        TripEventBroker broker = new TripEventBroker();
        broker.subscribe(42L, "user:1", "203.0.113.10");
        broker.subscribe(42L, "user:1", "203.0.113.10");

        assertThatThrownBy(() -> broker.subscribe(42L, "user:1", "203.0.113.10"))
            .isInstanceOf(TripEventBroker.StreamLimitExceededException.class);

        assertThat(broker.subscriberCountForTest(42L)).isEqualTo(2);
        assertThat(broker.globalSubscriberCountForTest()).isEqualTo(2);
    }

    @Test
    void limitsSubscriptionsPerClientIpAcrossActors() {
        TripEventBroker broker = new TripEventBroker();
        for (int index = 0; index < TripEventBroker.MAX_SUBSCRIBERS_PER_IP; index++) {
            broker.subscribe(42L, "user:" + index, "203.0.113.10");
        }

        assertThatThrownBy(() -> broker.subscribe(42L, "user:overflow", "203.0.113.10"))
            .isInstanceOf(TripEventBroker.StreamLimitExceededException.class);

        assertThat(broker.subscriberCountForTest(42L)).isEqualTo(TripEventBroker.MAX_SUBSCRIBERS_PER_IP);
        assertThat(broker.globalSubscriberCountForTest()).isEqualTo(TripEventBroker.MAX_SUBSCRIBERS_PER_IP);
    }
}
