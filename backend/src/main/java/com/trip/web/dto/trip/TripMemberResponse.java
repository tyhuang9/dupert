package com.trip.web.dto.trip;

import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;

public record TripMemberResponse(
    long userId,
    String email,
    String displayName,
    TripRole role
) {

    public static TripMemberResponse of(TripMember member, User user) {
        return new TripMemberResponse(
            member.getId().getUserId(),
            user.getEmail(),
            user.getDisplayName(),
            member.getRole()
        );
    }
}
