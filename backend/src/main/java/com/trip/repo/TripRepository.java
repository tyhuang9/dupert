package com.trip.repo;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.Trip;

/**
 * Spring Data repository for {@link Trip}.
 *
 * <p>Public lookups go through {@code publicId} (the URL-safe nanoid in
 * {@code /trips/{publicId}}); the numeric primary key is server-internal and never
 * appears in URLs or client payloads. {@link com.trip.service.trip.TripAccessGuard}
 * resolves a {@code publicId} to a {@link Trip} only after confirming the caller is a
 * member, so a non-member who guesses a {@code publicId} still receives the same 404
 * as a non-existent one — see PROJECT.md §5.
 */
public interface TripRepository extends JpaRepository<Trip, Long> {

    Optional<Trip> findByPublicId(String publicId);

    /**
     * Serializes structural activity writes for a trip. The activity service takes this
     * lock before checking the per-trip cap or calculating/reassigning bucket positions.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Trip t WHERE t.id = :tripId")
    Optional<Trip> findByIdForUpdate(@Param("tripId") Long tripId);

    List<Trip> findAllByOwnerId(Long ownerId);

    List<Trip> findAllByIdInOrderByCreatedAtDesc(Collection<Long> ids);
}
