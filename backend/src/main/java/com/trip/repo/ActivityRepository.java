package com.trip.repo;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.Activity;

/**
 * Spring Data repository for {@link Activity}.
 *
 * <p>Activities belong to a trip and are ordered within a day. All queries respect the
 * {@code day_date} and {@code trip_id} pairing. The {@code order_index} column maintains
 * a per-day ordering for UI display and drag-and-drop operations.
 */
public interface ActivityRepository extends JpaRepository<Activity, Long> {

    /**
     * Find all activities for a specific day of a trip, ordered by {@code order_index}.
     */
    List<Activity> findByTripIdAndDayDateOrderByOrderIndex(Long tripId, LocalDate dayDate);

    /**
     * Find all no-day idea activities for a trip, ordered by {@code order_index}.
     */
    List<Activity> findByTripIdAndDayDateIsNullOrderByOrderIndex(Long tripId);

    /**
     * Find all activities for a trip within a date range, ordered by day and then index.
     */
    @Query("""
        SELECT a FROM Activity a
        WHERE a.tripId = :tripId
          AND (a.dayDate IS NULL OR a.dayDate BETWEEN :startDate AND :endDate)
        ORDER BY CASE WHEN a.dayDate IS NULL THEN 1 ELSE 0 END, a.dayDate, a.orderIndex
        """)
    List<Activity> findAllVisibleForTrip(@Param("tripId") Long tripId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    /**
     * Find a single activity by id, with IDOR checks deferred to service layer.
     */
    Optional<Activity> findById(Long id);

    /**
     * Count activities for a trip, used to enforce resource caps.
     */
    long countByTripId(Long tripId);

    /**
     * Find the maximum order_index for a specific day to compute the next index.
     */
    @Query("SELECT COALESCE(MAX(a.orderIndex), -1) FROM Activity a WHERE a.tripId = :tripId AND a.dayDate = :dayDate")
    int findMaxOrderIndexForDay(@Param("tripId") Long tripId, @Param("dayDate") LocalDate dayDate);

    /**
     * Find the maximum order_index for no-day ideas to compute the next index.
     */
    @Query("SELECT COALESCE(MAX(a.orderIndex), -1) FROM Activity a WHERE a.tripId = :tripId AND a.dayDate IS NULL")
    int findMaxOrderIndexForIdeas(@Param("tripId") Long tripId);
}
