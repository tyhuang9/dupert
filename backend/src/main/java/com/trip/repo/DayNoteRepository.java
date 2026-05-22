package com.trip.repo;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.DayNote;

/**
 * Spring Data repository for {@link DayNote}.
 *
 * <p>Day notes are keyed by the composite ({@code trip_id}, {@code day_date}) pair.
 * Each day in a trip has at most one note. Notes default to empty string and are updated
 * via {@code PUT /api/trips/{publicId}/notes/{date}}.
 */
public interface DayNoteRepository extends JpaRepository<DayNote, DayNote.Id> {

    /**
     * Find a note for a specific trip day.
     */
    Optional<DayNote> findById_TripIdAndId_DayDate(Long tripId, LocalDate dayDate);

    /**
     * Find all notes for a trip within a date range.
     */
    @Query("SELECT n FROM DayNote n WHERE n.id.tripId = :tripId AND n.id.dayDate BETWEEN :startDate AND :endDate ORDER BY n.id.dayDate")
    List<DayNote> findAllInDateRange(@Param("tripId") Long tripId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);
}
