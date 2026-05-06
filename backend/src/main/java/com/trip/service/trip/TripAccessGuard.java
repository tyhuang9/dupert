package com.trip.service.trip;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.web.exception.NotFoundException;

/**
 * The single chokepoint that gates every {@code /api/trips/**} request — see PROJECT.md
 * §5: "Possession of a URL is never enough to view or edit a trip." Every miss collapses
 * to {@link NotFoundException}: a non-member must not be able to distinguish "trip
 * doesn't exist" from "trip exists but I'm not on it" — that distinction would make
 * {@code publicId} an enumerable existence oracle.
 *
 * <p>This chunk wires the JWT/user path. The guest-session path (Piece 5) will plug in
 * via a future {@code resolveForGuest(publicId, guestSessionId)} method on this same
 * class; the current method names are deliberately user-scoped so the guest variant
 * doesn't have to fight for naming space.
 */
@Service
public class TripAccessGuard {

    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;

    public TripAccessGuard(TripRepository tripRepository,
                           TripMemberRepository tripMemberRepository) {
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
    }

    /**
     * Resolves the trip if {@code userId} is a member, otherwise throws
     * {@link NotFoundException}. The 404 (not 403) is deliberate per PROJECT.md §5.
     */
    @Transactional(readOnly = true)
    public ResolvedTrip resolveForUser(String publicId, Long userId) {
        Trip trip = tripRepository.findByPublicId(publicId)
            .orElseThrow(() -> new NotFoundException("trip not found: publicId=" + publicId));

        Optional<TripMember> membership =
            tripMemberRepository.findByIdTripIdAndIdUserId(trip.getId(), userId);

        return membership
            .map(m -> new ResolvedTrip(trip, m.getRole()))
            .orElseThrow(() -> new NotFoundException(
                "user is not a member: userId=" + userId + " tripId=" + trip.getId()));
    }

    /**
     * Like {@link #resolveForUser}, but additionally requires the caller's role be at
     * least {@code minimumRole} (OWNER &gt; EDITOR &gt; VIEWER, by {@link TripRole#rank()}).
     * A member with too low a role gets the same {@link NotFoundException} as a
     * non-member — no information leak about the privilege tier.
     */
    @Transactional(readOnly = true)
    public ResolvedTrip resolveForUserAtLeast(String publicId, Long userId, TripRole minimumRole) {
        ResolvedTrip resolved = resolveForUser(publicId, userId);
        if (resolved.role().rank() < minimumRole.rank()) {
            throw new NotFoundException(
                "role too low: userId=" + userId
                    + " tripId=" + resolved.trip().getId()
                    + " has=" + resolved.role()
                    + " needs=" + minimumRole);
        }
        return resolved;
    }
}
