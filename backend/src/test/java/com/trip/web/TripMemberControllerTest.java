package com.trip.web;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.DayNoteRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.RefreshTokenRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.service.trip.ReflectionIds;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TripMemberControllerTest {

    private static final long ALICE_ID = 100L;
    private static final long BOB_ID = 200L;
    private static final long TRIP_PK = 42L;
    private static final String TRIP_PUBLIC_ID = "abc23def45gh";

    @Autowired
    MockMvc mvc;

    @Autowired
    JwtService realJwtService;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    RefreshTokenRepository refreshTokenRepository;

    @MockitoBean
    TripRepository tripRepository;

    @MockitoBean
    TripMemberRepository tripMemberRepository;

    @MockitoBean
    ActivityRepository activityRepository;

    @MockitoBean
    DayNoteRepository dayNoteRepository;

    @MockitoBean
    GuestSessionRepository guestSessionRepository;

    @MockitoBean
    PasswordResetTokenRepository passwordResetTokenRepository;

    @MockitoBean
    ShareLinkRepository shareLinkRepository;

    @MockitoBean
    BreachedPasswordChecker breachedPasswordChecker;

    @BeforeEach
    void wireDefaults() {
        Trip trip = new Trip(
            TRIP_PUBLIC_ID,
            ALICE_ID,
            "Tokyo 2026",
            "Tokyo, Japan",
            LocalDate.of(2026, 5, 1),
            LocalDate.of(2026, 5, 3));
        ReflectionIds.setId(trip, TRIP_PK);
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(trip));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));
    }

    @Test
    void listReturnsMembersForTripMember() throws Exception {
        TripMember owner = new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER);
        TripMember editor = new TripMember(TRIP_PK, BOB_ID, TripRole.EDITOR);
        when(tripMemberRepository.findAllByIdTripIdOrderByCreatedAtAsc(TRIP_PK))
            .thenReturn(List.of(owner, editor));
        when(userRepository.findAllById(List.of(ALICE_ID, BOB_ID)))
            .thenReturn(List.of(
                user(ALICE_ID, "alice@example.com", "Alice"),
                user(BOB_ID, "bob@example.com", "Bob")));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/members")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].userId").value(ALICE_ID))
            .andExpect(jsonPath("$[0].displayName").value("Alice"))
            .andExpect(jsonPath("$[0].role").value("OWNER"))
            .andExpect(jsonPath("$[1].userId").value(BOB_ID))
            .andExpect(jsonPath("$[1].email").value("bob@example.com"))
            .andExpect(jsonPath("$[1].role").value("EDITOR"));
    }

    @Test
    void listForNonMemberReturns404() throws Exception {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, BOB_ID))
            .thenReturn(Optional.empty());

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/members")
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));
    }

    private String bearerFor(long userId) {
        return "Bearer " + realJwtService.issueAccessToken(userId);
    }

    private static User user(long id, String email, String displayName) {
        User user = new User(email, "hash", displayName);
        ReflectionIds.setId(user, id);
        return user;
    }
}
