package com.trip.domain;

/**
 * Membership role on a trip. Ordered most-privileged-first by {@link #rank()}.
 */
public enum TripRole {
    OWNER(2),
    EDITOR(1),
    VIEWER(0);

    private final int rank;

    TripRole(int rank) {
        this.rank = rank;
    }

    /**
     * Numeric privilege level: OWNER=2, EDITOR=1, VIEWER=0. Higher means more privileged.
     * Use {@code a.rank() >= b.rank()} for "at-least" comparisons rather than
     * {@code Enum.ordinal()}, which would silently rebind to declaration order if a
     * future role were inserted in the middle.
     */
    public int rank() {
        return rank;
    }
}
