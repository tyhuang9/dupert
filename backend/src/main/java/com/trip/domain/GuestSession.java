package com.trip.domain;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "guest_sessions")
public class GuestSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "share_link_id", nullable = false)
    private Long shareLinkId;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private OffsetDateTime lastSeenAt;

    protected GuestSession() {
        // JPA
    }

    public GuestSession(Long shareLinkId, String displayName) {
        this.shareLinkId = shareLinkId;
        this.displayName = displayName;
    }

    public Long getId() {
        return id;
    }

    public Long getShareLinkId() {
        return shareLinkId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getLastSeenAt() {
        return lastSeenAt;
    }

    public void touch(OffsetDateTime when) {
        this.lastSeenAt = when;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (lastSeenAt == null) {
            lastSeenAt = now;
        }
    }
}
