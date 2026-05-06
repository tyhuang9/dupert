package com.trip.repo;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.TripMember;

/**
 * Spring Data repository for {@link TripMember}.
 *
 * <p>{@link TripMember} uses an embedded composite key
 * {@link TripMember.Id}{@code (tripId, userId)}. Spring Data resolves the embedded-id
 * path with the {@code IdTripId} / {@code IdUserId} naming used below.
 */
public interface TripMemberRepository extends JpaRepository<TripMember, TripMember.Id> {

    Optional<TripMember> findByIdTripIdAndIdUserId(Long tripId, Long userId);

    List<TripMember> findAllByIdUserId(Long userId);

    boolean existsByIdTripIdAndIdUserId(Long tripId, Long userId);
}
