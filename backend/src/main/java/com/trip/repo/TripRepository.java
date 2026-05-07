package com.trip.repo;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

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

    List<Trip> findAllByIdInOrderByCreatedAtDesc(Collection<Long> ids);
}
