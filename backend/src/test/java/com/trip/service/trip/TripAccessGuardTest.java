package com.trip.service.trip;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.web.exception.NotFoundException;

@ExtendWith(MockitoExtension.class)
class TripAccessGuardTest {

    private static final String PUBLIC_ID = "abc123def456";
    private static final Long TRIP_ID = 42L;
    private static final Long USER_ID = 7L;

    @Mock
    private TripRepository tripRepository;

    @Mock
    private TripMemberRepository tripMemberRepository;

    @InjectMocks
    private TripAccessGuard guard;

    private Trip trip;

    @BeforeEach
    void setUp() {
        trip = new Trip(PUBLIC_ID, 99L, "Tokyo", "Tokyo, JP",
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        ReflectionIds.setId(trip, TRIP_ID);
        // lenient so per-test stubs aren't flagged as unused when a particular code path
        // never reaches the membership lookup.
        lenient().when(tripRepository.findByPublicId(PUBLIC_ID)).thenReturn(Optional.of(trip));
    }

    private TripMember member(TripRole role) {
        return new TripMember(TRIP_ID, USER_ID, role);
    }

    @Test
    void resolveForUserReturnsTripWithRoleWhenMember() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.EDITOR)));

        ResolvedTrip resolved = guard.resolveForUser(PUBLIC_ID, USER_ID);

        assertThat(resolved.trip()).isSameAs(trip);
        assertThat(resolved.role()).isEqualTo(TripRole.EDITOR);
    }

    @Test
    void resolveForUserThrowsNotFoundWhenNotAMember() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> guard.resolveForUser(PUBLIC_ID, USER_ID))
            .isInstanceOf(NotFoundException.class);
    }

    @Test
    void resolveForUserThrowsNotFoundWhenPublicIdDoesNotExist() {
        when(tripRepository.findByPublicId("nope")).thenReturn(Optional.empty());

        // Same exception type as the non-member case — controllers / clients cannot tell
        // them apart, which is the whole point of the 404-not-403 collapse.
        assertThatThrownBy(() -> guard.resolveForUser("nope", USER_ID))
            .isInstanceOf(NotFoundException.class);
    }

    @Test
    void resolveForUserAtLeastEditorRejectsViewer() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.VIEWER)));

        assertThatThrownBy(() -> guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.EDITOR))
            .isInstanceOf(NotFoundException.class);
    }

    @Test
    void resolveForUserAtLeastEditorAcceptsEditor() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.EDITOR)));

        ResolvedTrip resolved =
            guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.EDITOR);

        assertThat(resolved.role()).isEqualTo(TripRole.EDITOR);
    }

    @Test
    void resolveForUserAtLeastEditorAcceptsOwner() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.OWNER)));

        ResolvedTrip resolved =
            guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.EDITOR);

        assertThat(resolved.role()).isEqualTo(TripRole.OWNER);
    }

    @Test
    void resolveForUserAtLeastOwnerAcceptsOwner() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.OWNER)));

        ResolvedTrip resolved =
            guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.OWNER);

        assertThat(resolved.role()).isEqualTo(TripRole.OWNER);
    }

    @Test
    void resolveForUserAtLeastOwnerRejectsEditor() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_ID, USER_ID))
            .thenReturn(Optional.of(member(TripRole.EDITOR)));

        assertThatThrownBy(() -> guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.OWNER))
            .isInstanceOf(NotFoundException.class);
    }

    @Test
    void resolveForUserAtLeastFromNonMemberStillNotFound() {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(eq(TRIP_ID), any()))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> guard.resolveForUserAtLeast(PUBLIC_ID, USER_ID, TripRole.VIEWER))
            .isInstanceOf(NotFoundException.class);
    }
}
