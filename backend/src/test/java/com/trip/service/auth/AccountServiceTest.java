package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.service.trip.ReflectionIds;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    UserRepository userRepository;

    @Mock
    PasswordEncoder passwordEncoder;

    @Mock
    RefreshTokenService refreshTokenService;

    @Mock
    BreachedPasswordChecker breachedPasswordChecker;

    @Mock
    TripRepository tripRepository;

    @Mock
    TripMemberRepository tripMemberRepository;

    AccountService service;

    @BeforeEach
    void setUp() {
        service = new AccountService(
            userRepository,
            passwordEncoder,
            refreshTokenService,
            breachedPasswordChecker,
            tripRepository,
            tripMemberRepository);
    }

    @Test
    void deleteAccountDeletesOwnedTripWithNoRemainingMembers() {
        User user = userWith(1L);
        Trip privateTrip = tripWith(10L, 1L);
        TripMember owner = new TripMember(10L, 1L, TripRole.OWNER);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(tripRepository.findAllByOwnerId(1L)).thenReturn(List.of(privateTrip));
        when(tripMemberRepository.findAllByIdTripIdOrderByCreatedAtAsc(10L))
            .thenReturn(List.of(owner));

        service.deleteAccount(1L);

        verify(refreshTokenService).revokeAllForUser(1L);
        verify(tripRepository).delete(privateTrip);
        verify(tripRepository, never()).save(privateTrip);
        verify(userRepository).delete(user);
    }

    @Test
    void deleteAccountTransfersSharedOwnedTripToBestRemainingMember() {
        User user = userWith(1L);
        Trip sharedTrip = tripWith(10L, 1L);
        TripMember owner = new TripMember(10L, 1L, TripRole.OWNER);
        TripMember viewer = new TripMember(10L, 2L, TripRole.VIEWER);
        TripMember editor = new TripMember(10L, 3L, TripRole.EDITOR);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(tripRepository.findAllByOwnerId(1L)).thenReturn(List.of(sharedTrip));
        when(tripMemberRepository.findAllByIdTripIdOrderByCreatedAtAsc(10L))
            .thenReturn(List.of(owner, viewer, editor));

        service.deleteAccount(1L);

        assertThat(sharedTrip.getOwnerId()).isEqualTo(3L);
        assertThat(editor.getRole()).isEqualTo(TripRole.OWNER);
        assertThat(viewer.getRole()).isEqualTo(TripRole.VIEWER);
        verify(tripRepository).save(sharedTrip);
        verify(tripRepository, never()).delete(sharedTrip);
        verify(tripMemberRepository).save(editor);
        verify(userRepository).delete(user);
    }

    @Test
    void deleteAccountForMissingUserStillRevokesRefreshTokens() {
        when(userRepository.findById(1L)).thenReturn(Optional.empty());

        service.deleteAccount(1L);

        verify(refreshTokenService).revokeAllForUser(1L);
        verify(tripRepository, never()).findAllByOwnerId(1L);
        verify(userRepository, never()).delete(org.mockito.ArgumentMatchers.any(User.class));
    }

    private static User userWith(long id) {
        User user = new User("alice@example.com", "hash", "Alice");
        ReflectionIds.setId(user, id);
        return user;
    }

    private static Trip tripWith(long id, long ownerId) {
        Trip trip = new Trip(
            "abc23def45gh",
            ownerId,
            "Tokyo 2026",
            "Tokyo, Japan",
            LocalDate.of(2026, 5, 1),
            LocalDate.of(2026, 5, 3));
        ReflectionIds.setId(trip, id);
        return trip;
    }
}
