package com.trip.service.trip;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.TripMember;
import com.trip.domain.User;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.UserRepository;
import com.trip.web.dto.trip.TripMemberResponse;

@Service
public class TripMemberService {

    private final TripAccessGuard tripAccessGuard;
    private final TripMemberRepository tripMemberRepository;
    private final UserRepository userRepository;

    public TripMemberService(TripAccessGuard tripAccessGuard,
                             TripMemberRepository tripMemberRepository,
                             UserRepository userRepository) {
        this.tripAccessGuard = tripAccessGuard;
        this.tripMemberRepository = tripMemberRepository;
        this.userRepository = userRepository;
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
}
