package com.trip.service.trip;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.UserRepository;
import com.trip.service.realtime.TripEvent;
import com.trip.service.realtime.TripEventPublisher;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;

@ExtendWith(MockitoExtension.class)
class TripMemberServiceTest {

    private static final long OWNER_ID = 100L;
    private static final long MEMBER_ID = 200L;
    private static final long TRIP_ID = 42L;
    private static final long OTHER_TRIP_ID = 84L;
    private static final String PUBLIC_ID = "abc23def45gh";

    @Mock
    TripAccessGuard tripAccessGuard;

    @Mock
    TripMemberRepository tripMemberRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    TripEventPublisher tripEventPublisher;

    TripMemberService service;
    Trip trip;

    @BeforeEach
    void setUp() {
        trip = new Trip(
            PUBLIC_ID,
            OWNER_ID,
            "Tokyo 2026",
            "Tokyo, Japan",
            LocalDate.of(2026, 5, 1),
            LocalDate.of(2026, 5, 3));
        ReflectionIds.setId(trip, TRIP_ID);
        service = new TripMemberService(
            tripAccessGuard, tripMemberRepository, userRepository, tripEventPublisher);
    }

    @Test
    void ownerRemovesMemberScopedToResolvedTrip() {
        TripMember member = new TripMember(TRIP_ID, MEMBER_ID, TripRole.EDITOR);
        when(tripAccessGuard.resolveForUser(PUBLIC_ID, OWNER_ID))
            .thenReturn(new ResolvedTrip(trip, TripRole.OWNER));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, MEMBER_ID))
            .thenReturn(Optional.of(member));

        service.removeMember(PUBLIC_ID, OWNER_ID, MEMBER_ID);

        verify(tripMemberRepository).findByIdTripIdAndIdUserId(TRIP_ID, MEMBER_ID);
        verify(tripMemberRepository).delete(member);
        ArgumentCaptor<TripEvent> eventCaptor = ArgumentCaptor.forClass(TripEvent.class);
        verify(tripEventPublisher)
            .publishAndDisconnectAfterCommit(eq(TRIP_ID), eventCaptor.capture());
        assertThat(eventCaptor.getValue().type()).isEqualTo("members.changed");
        assertThat(eventCaptor.getValue().publicId()).isEqualTo(PUBLIC_ID);
    }

    @Test
    void nonOwnerCannotRemoveMember() {
        when(tripAccessGuard.resolveForUser(PUBLIC_ID, MEMBER_ID))
            .thenReturn(new ResolvedTrip(trip, TripRole.EDITOR));

        assertThatThrownBy(() -> service.removeMember(PUBLIC_ID, MEMBER_ID, OWNER_ID))
            .isInstanceOf(AccessDeniedException.class);

        verify(tripMemberRepository, never())
            .findByIdTripIdAndIdUserId(TRIP_ID, OWNER_ID);
        verify(tripMemberRepository, never()).delete(any());
        verifyNoInteractions(tripEventPublisher);
    }

    @Test
    void ownerCannotRemoveSelf() {
        when(tripAccessGuard.resolveForUser(PUBLIC_ID, OWNER_ID))
            .thenReturn(new ResolvedTrip(trip, TripRole.OWNER));

        assertThatThrownBy(() -> service.removeMember(PUBLIC_ID, OWNER_ID, OWNER_ID))
            .isInstanceOf(ValidationException.class)
            .extracting(error -> ((ValidationException) error).slug())
            .isEqualTo("cannot_remove_owner");

        verify(tripMemberRepository, never())
            .findByIdTripIdAndIdUserId(TRIP_ID, OWNER_ID);
        verify(tripMemberRepository, never()).delete(any());
        verifyNoInteractions(tripEventPublisher);
    }

    @Test
    void ownerRoleCannotBeRemovedEvenFromInconsistentMembershipData() {
        TripMember anotherOwner = new TripMember(TRIP_ID, MEMBER_ID, TripRole.OWNER);
        when(tripAccessGuard.resolveForUser(PUBLIC_ID, OWNER_ID))
            .thenReturn(new ResolvedTrip(trip, TripRole.OWNER));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, MEMBER_ID))
            .thenReturn(Optional.of(anotherOwner));

        assertThatThrownBy(() -> service.removeMember(PUBLIC_ID, OWNER_ID, MEMBER_ID))
            .isInstanceOf(ValidationException.class)
            .extracting(error -> ((ValidationException) error).slug())
            .isEqualTo("cannot_remove_owner");

        verify(tripMemberRepository, never()).delete(anotherOwner);
        verifyNoInteractions(tripEventPublisher);
    }

    @Test
    void missingOrCrossTripTargetIsNotFound() {
        when(tripAccessGuard.resolveForUser(PUBLIC_ID, OWNER_ID))
            .thenReturn(new ResolvedTrip(trip, TripRole.OWNER));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, MEMBER_ID))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.removeMember(PUBLIC_ID, OWNER_ID, MEMBER_ID))
            .isInstanceOf(NotFoundException.class);

        verify(tripMemberRepository).findByIdTripIdAndIdUserId(TRIP_ID, MEMBER_ID);
        verify(tripMemberRepository, never())
            .findByIdTripIdAndIdUserId(OTHER_TRIP_ID, MEMBER_ID);
        verify(tripMemberRepository, never()).delete(any());
        verifyNoInteractions(tripEventPublisher);
    }
}
