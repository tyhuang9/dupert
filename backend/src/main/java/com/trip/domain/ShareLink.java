package com.trip.domain;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "share_links")
public class ShareLink {

    public static final String DEFAULT_NAME = "Shared link";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(name = "token_hash", nullable = false, length = 64, updatable = false)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 16)
    private TripRole role;

    @Column(name = "name", nullable = false, length = 80)
    private String name = DEFAULT_NAME;

    @Column(name = "allow_anonymous", nullable = false)
    private boolean allowAnonymous;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    protected ShareLink() {
        // JPA
    }

    public ShareLink(Long tripId, String tokenHash, TripRole role, boolean allowAnonymous,
                     Long createdBy, OffsetDateTime expiresAt) {
        this(tripId, tokenHash, role, DEFAULT_NAME, allowAnonymous, createdBy, expiresAt);
    }

    public ShareLink(Long tripId, String tokenHash, TripRole role, String name, boolean allowAnonymous,
                     Long createdBy, OffsetDateTime expiresAt) {
        this.tripId = tripId;
        this.tokenHash = tokenHash;
        this.role = role;
        this.name = name == null || name.isBlank() ? DEFAULT_NAME : name;
        this.allowAnonymous = allowAnonymous;
        this.createdBy = createdBy;
        this.expiresAt = expiresAt;
    }

    public Long getId() {
        return id;
    }

    public Long getTripId() {
        return tripId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public TripRole getRole() {
        return role;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isAllowAnonymous() {
        return allowAnonymous;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public void revoke(OffsetDateTime when) {
        this.revokedAt = when;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
        if (name == null || name.isBlank()) {
            name = DEFAULT_NAME;
        }
    }
}
