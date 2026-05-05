package com.trip.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "activities")
public class Activity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false, updatable = false)
    private Long tripId;

    @Column(name = "day_date", nullable = false)
    private LocalDate dayDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 16)
    private ActivityCategory category;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "notes", length = 5000)
    private String notes;

    @Column(name = "mapbox_id", length = 200)
    private String mapboxId;

    @Column(name = "place_name", length = 300)
    private String placeName;

    @Column(name = "address", length = 500)
    private String address;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "created_by_guest_session_id")
    private Long createdByGuestSessionId;

    @Column(name = "updated_by_user_id")
    private Long updatedByUserId;

    @Column(name = "updated_by_guest_session_id")
    private Long updatedByGuestSessionId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Activity() {
        // JPA
    }

    public Activity(Long tripId, LocalDate dayDate, ActivityCategory category, String title) {
        this.tripId = tripId;
        this.dayDate = dayDate;
        this.category = category;
        this.title = title;
    }

    public Long getId() {
        return id;
    }

    public Long getTripId() {
        return tripId;
    }

    public LocalDate getDayDate() {
        return dayDate;
    }

    public void setDayDate(LocalDate dayDate) {
        this.dayDate = dayDate;
    }

    public ActivityCategory getCategory() {
        return category;
    }

    public void setCategory(ActivityCategory category) {
        this.category = category;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalTime startTime) {
        this.startTime = startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public void setEndTime(LocalTime endTime) {
        this.endTime = endTime;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getMapboxId() {
        return mapboxId;
    }

    public void setMapboxId(String mapboxId) {
        this.mapboxId = mapboxId;
    }

    public String getPlaceName() {
        return placeName;
    }

    public void setPlaceName(String placeName) {
        this.placeName = placeName;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public int getOrderIndex() {
        return orderIndex;
    }

    public void setOrderIndex(int orderIndex) {
        this.orderIndex = orderIndex;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public Long getCreatedByGuestSessionId() {
        return createdByGuestSessionId;
    }

    public void setCreatedByGuestSessionId(Long createdByGuestSessionId) {
        this.createdByGuestSessionId = createdByGuestSessionId;
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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
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
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
