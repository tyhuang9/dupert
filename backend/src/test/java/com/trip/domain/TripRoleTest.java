package com.trip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TripRoleTest {

    @Test
    void rankOrderingIsOwnerGreaterThanEditorGreaterThanViewer() {
        assertThat(TripRole.OWNER.rank()).isGreaterThan(TripRole.EDITOR.rank());
        assertThat(TripRole.EDITOR.rank()).isGreaterThan(TripRole.VIEWER.rank());
    }

    @Test
    void rankValuesAreStable() {
        // Pinned per the enum's javadoc contract — callers comparing by rank rely on
        // these specific values, and a future role insertion must not silently shift them.
        assertThat(TripRole.OWNER.rank()).isEqualTo(2);
        assertThat(TripRole.EDITOR.rank()).isEqualTo(1);
        assertThat(TripRole.VIEWER.rank()).isEqualTo(0);
    }

    @Test
    void atLeastChecksFollowRankOrdering() {
        assertThat(TripRole.OWNER.rank() >= TripRole.EDITOR.rank()).isTrue();
        assertThat(TripRole.EDITOR.rank() >= TripRole.EDITOR.rank()).isTrue();
        assertThat(TripRole.VIEWER.rank() >= TripRole.EDITOR.rank()).isFalse();
        assertThat(TripRole.EDITOR.rank() >= TripRole.OWNER.rank()).isFalse();
    }
}
