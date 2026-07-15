package com.trip.service.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TripEventTest {

    @Test
    void membersChangedCreatesPointerEvent() {
        TripEvent event = TripEvent.membersChanged("abc23def45gh");

        assertThat(event.type()).isEqualTo("members.changed");
        assertThat(event.publicId()).isEqualTo("abc23def45gh");
        assertThat(event.activityId()).isNull();
        assertThat(event.dayDate()).isNull();
        assertThat(event.occurredAt()).isNotNull();
    }
}
