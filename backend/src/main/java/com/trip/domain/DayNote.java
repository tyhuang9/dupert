package com.trip.domain;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "day_notes")
public class DayNote {

    @Embeddable
    public static class Id implements Serializable {

        @Column(name = "trip_id")
        private Long tripId;

        @Column(name = "day_date")
        private LocalDate dayDate;

        protected Id() {
            // JPA
        }

        public Id(Long tripId, LocalDate dayDate) {
            this.tripId = tripId;
            this.dayDate = dayDate;
        }

        public Long getTripId() {
            return tripId;
        }

        public LocalDate getDayDate() {
            return dayDate;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Id id)) return false;
            return Objects.equals(tripId, id.tripId) && Objects.equals(dayDate, id.dayDate);
        }

        @Override
        public int hashCode() {
            return Objects.hash(tripId, dayDate);
        }
    }

    @EmbeddedId
    private Id id;

    @Column(name = "note", nullable = false, length = 5000)
    private String note = "";

    @Column(name = "updated_by_user_id")
    private Long updatedByUserId;

    @Column(name = "updated_by_guest_session_id")
    private Long updatedByGuestSessionId;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected DayNote() {
        // JPA
    }

    public DayNote(Long tripId, LocalDate dayDate, String note) {
        this.id = new Id(tripId, dayDate);
        this.note = note == null ? "" : note;
    }

    public Id getId() {
        return id;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note == null ? "" : note;
    }

    public Long getUpdatedByUserId() {
        return updatedByUserId;
    }

    public void setUpdatedByUserId(Long updatedByUserId) {
        this.updatedByUserId = updatedByUserId;
    }

    public Long getUpdatedByGuestSessionId() {
        return updatedByGuestSessionId;
    }

    public void setUpdatedByGuestSessionId(Long updatedByGuestSessionId) {
        this.updatedByGuestSessionId = updatedByGuestSessionId;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public long getVersion() {
        return version;
    }

    @PrePersist
    void onCreate() {
        if (updatedAt == null) {
            updatedAt = OffsetDateTime.now();
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
