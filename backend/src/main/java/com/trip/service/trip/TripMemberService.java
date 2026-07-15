package com.trip.service.trip;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.UserRepository;
import com.trip.service.realtime.TripEvent;
import com.trip.service.realtime.TripEventPublisher;
import com.trip.web.dto.trip.TripMemberResponse;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;

@Service
public class TripMemberService {

    private final TripAccessGuard tripAccessGuard;
    private final TripMemberRepository tripMemberRepository;
    private final UserRepository userRepository;
    private final TripEventPublisher tripEventPublisher;

    public TripMemberService(TripAccessGuard tripAccessGuard,
                             TripMemberRepository tripMemberRepository,
                             UserRepository userRepository,
                             TripEventPublisher tripEventPublisher) {
        this.tripAccessGuard = tripAccessGuard;
        this.tripMemberRepository = tripMemberRepository;
        this.userRepository = userRepository;
        this.tripEventPublisher = tripEventPublisher;
    }

    @Transactional(readOnly = true)
    public List<TripMemberResponse> listMembers(String publicId, Long userId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUser(publicId, userId);
        List<TripMember> members =
            tripMemberRepository.findAllByIdTripIdOrderByCreatedAtAsc(resolved.trip().getId());
        List<Long> userIds = members.stream()
            .map(member -> member.getId().getUserId())
            .toList();
        Map<Long, User> usersById = new HashMap<>();
        userRepository.findAllById(userIds).forEach(user -> usersById.put(user.getId(), user));
        return members.stream()
            .flatMap(member -> {
                User user = usersById.get(member.getId().getUserId());
                return user == null
                    ? java.util.stream.Stream.empty()
                    : java.util.stream.Stream.of(TripMemberResponse.of(member, user));
            })
            .toList();
    }

    @Transactional
    public void removeMember(String publicId, Long requesterUserId, Long targetUserId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUser(publicId, requesterUserId);
        if (resolved.role() != TripRole.OWNER) {
            throw new AccessDeniedException("only the trip owner can remove members");
        }
        if (requesterUserId.equals(targetUserId)) {
            throw ownerRemovalRejected(requesterUserId, resolved.trip().getId());
        }

        TripMember targetMembership = tripMemberRepository
            .findByIdTripIdAndIdUserId(resolved.trip().getId(), targetUserId)
            .orElseThrow(() -> new NotFoundException(
                "trip member not found: userId=" + targetUserId
                    + " tripId=" + resolved.trip().getId()));
        if (targetMembership.getRole() == TripRole.OWNER) {
            throw ownerRemovalRejected(targetUserId, resolved.trip().getId());
        }

        tripMemberRepository.delete(targetMembership);
        tripEventPublisher.publishAndDisconnectAfterCommit(
            resolved.trip().getId(), TripEvent.membersChanged(publicId));
    }

    private static ValidationException ownerRemovalRejected(Long userId, Long tripId) {
        return new ValidationException(
            "cannot_remove_owner",
            "trip owner cannot be removed: userId=" + userId + " tripId=" + tripId);
    }
}
