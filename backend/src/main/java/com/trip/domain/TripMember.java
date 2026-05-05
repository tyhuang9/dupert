package com.trip.domain;

import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "trip_members")
public class TripMember {

    @Embeddable
    public static class Id implements Serializable {

        @Column(name = "trip_id")
        private Long tripId;

        @Column(name = "user_id")
        private Long userId;

        protected Id() {
            // JPA
        }

        public Id(Long tripId, Long userId) {
            this.tripId = tripId;
            this.userId = userId;
        }

        public Long getTripId() {
            return tripId;
        }

        public Long getUserId() {
            return userId;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Id id)) return false;
            return Objects.equals(tripId, id.tripId) && Objects.equals(userId, id.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(tripId, userId);
        }
    }

    @EmbeddedId
    private Id id;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 16)
    private TripRole role;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected TripMember() {
        // JPA
    }

    public TripMember(Long tripId, Long userId, TripRole role) {
        this.id = new Id(tripId, userId);
        this.role = role;
    }

    public Id getId() {
        return id;
    }

    public TripRole getRole() {
        return role;
    }

    public void setRole(TripRole role) {
        this.role = role;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }
}
