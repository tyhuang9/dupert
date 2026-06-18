package com.trip.service.trip;

import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.web.dto.trip.CreateTripRequest;
import com.trip.web.dto.trip.TripResponse;
import com.trip.web.dto.trip.UpdateTripRequest;
import com.trip.web.exception.ValidationException;

/**
 * Write-side trip operations. Read-side gating still flows through
 * {@link TripAccessGuard}; this class delegates to it for every per-trip read/update/delete
 * so the security invariant from PROJECT.md §5 — "Possession of a URL is never enough" —
 * has exactly one chokepoint.
 */
@Service
public class TripService {

    /** Maximum trip duration. The plan caps activities at 1000/trip; 365 days is the
     *  loose upper bound on date range so a malicious request can't allocate giant
     *  per-day index buckets in later pieces. */
    static final long MAX_TRIP_DAYS = 365L;

    /** Retry budget for {@code public_id} collisions. ~59 bits of entropy means a
     *  collision is astronomically unlikely; five in a row signals a broken RNG, not
     *  a normal failure mode, so we surface it as a 500. */
    static final int PUBLIC_ID_GENERATION_ATTEMPTS = 5;

    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final TripAccessGuard tripAccessGuard;
    private final PublicIdGenerator publicIdGenerator;

    public TripService(TripRepository tripRepository,
                       TripMemberRepository tripMemberRepository,
                       TripAccessGuard tripAccessGuard,
                       PublicIdGenerator publicIdGenerator) {
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.tripAccessGuard = tripAccessGuard;
        this.publicIdGenerator = publicIdGenerator;
    }

    @Transactional
    public TripResponse createTrip(Long ownerId, CreateTripRequest request) {
        validateDateRange(request.startDate(), request.endDate());

        String publicId = generateUniquePublicId();
        Trip trip = new Trip(
            publicId,
            ownerId,
            request.name().trim(),
            request.destination() == null ? null : request.destination().trim(),
            request.startDate(),
            request.endDate());
        Trip saved = tripRepository.save(trip);

        // Atomic with the trip insert — both share this @Transactional method, so a
        // failure on the member insert rolls back the trip and vice versa. Without the
        // OWNER row, TripAccessGuard would 404 the trip's own creator on the very next
        // request.
        tripMemberRepository.save(new TripMember(saved.getId(), ownerId, TripRole.OWNER));

        return TripResponse.of(saved, TripRole.OWNER);
    }

    @Transactional(readOnly = true)
    public List<TripResponse> listTripsForUser(Long userId) {
        List<TripMember> memberships = tripMemberRepository.findAllByIdUserId(userId);
        if (memberships.isEmpty()) {
            return List.of();
        }
        Map<Long, TripRole> roleByTripId = new HashMap<>(memberships.size());
        for (TripMember m : memberships) {
            roleByTripId.put(m.getId().getTripId(), m.getRole());
        }
        List<Trip> trips = tripRepository.findAllByIdInOrderByCreatedAtDesc(roleByTripId.keySet());
        return trips.stream()
            .map(t -> TripResponse.of(t, roleByTripId.get(t.getId())))
            .toList();
    }

    @Transactional(readOnly = true)
    public TripResponse getTrip(String publicId, Long userId) {
        return getTrip(publicId, TripActor.user(userId));
    }

    @Transactional(readOnly = true)
    public TripResponse getTrip(String publicId, TripActor actor) {
        ResolvedTrip resolved = tripAccessGuard.resolveForActor(publicId, actor);
        return TripResponse.of(resolved.trip(), resolved.role());
    }

    @Transactional
    public TripResponse updateTrip(String publicId, Long userId, UpdateTripRequest request) {
        return updateTrip(publicId, TripActor.user(userId), request);
    }

    @Transactional
    public TripResponse updateTrip(String publicId, TripActor actor, UpdateTripRequest request) {
        ResolvedTrip resolved =
            tripAccessGuard.resolveForActorAtLeast(publicId, actor, TripRole.EDITOR);
        Trip trip = resolved.trip();

        if (request.name() != null) {
            trip.setName(request.name().trim());
        }
        if (request.destination() != null) {
            trip.setDestination(request.destination().trim());
        }

        // Re-validate against the post-merge state. If only one date is provided in the
        // request, the other comes from the persisted trip — preventing an EDITOR from
        // moving the start past the end via a partial update.
        if (request.startDate() != null || request.endDate() != null) {
            var mergedStart = request.startDate() != null ? request.startDate() : trip.getStartDate();
            var mergedEnd = request.endDate() != null ? request.endDate() : trip.getEndDate();
            validateDateRange(mergedStart, mergedEnd);
            trip.setStartDate(mergedStart);
            trip.setEndDate(mergedEnd);
        }

        Trip saved = tripRepository.save(trip);
        return TripResponse.of(saved, resolved.role());
    }

    @Transactional
    public void deleteTrip(String publicId, Long userId) {
        ResolvedTrip resolved =
            tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.OWNER);
        // V1__init.sql declares ON DELETE CASCADE for trips → trip_members, share_links,
        // guest_sessions (via share_links), activities, day_notes — the dependent rows
        // disappear with the parent, no explicit fanout needed.
        tripRepository.delete(resolved.trip());
    }

    private static void validateDateRange(java.time.LocalDate start, java.time.LocalDate end) {
        if (start.isAfter(end)) {
            throw new ValidationException("invalid_date_range",
                "startDate must be on or before endDate");
        }
        long days = ChronoUnit.DAYS.between(start, end);
        if (days > MAX_TRIP_DAYS) {
            throw new ValidationException("invalid_date_range",
                "trip duration exceeds maximum of " + MAX_TRIP_DAYS + " days");
        }
    }

    private String generateUniquePublicId() {
        for (int attempt = 0; attempt < PUBLIC_ID_GENERATION_ATTEMPTS; attempt++) {
            String candidate = publicIdGenerator.generate();
            if (tripRepository.findByPublicId(candidate).isEmpty()) {
                return candidate;
            }
        }
        // Five collisions on ~59 bits of entropy is not a normal failure mode — the RNG
        // is broken, or someone is attacking it. Surface as 500 (IllegalStateException →
        // GlobalExceptionHandler.handleGeneric) rather than retrying forever.
        throw new IllegalStateException(
            "exhausted publicId generation retries (" + PUBLIC_ID_GENERATION_ATTEMPTS + ")");
    }
}
