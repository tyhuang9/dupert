package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.DayNote;
import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.DayNoteRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.RefreshTokenRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.service.realtime.TripEventPublisher;
import com.trip.service.trip.ReflectionIds;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DayNoteControllerTest {

    private static final long ALICE_ID = 100L;
    private static final long TRIP_PK = 42L;
    private static final String TRIP_PUBLIC_ID = "abc23def45gh";
    private static final LocalDate DAY_ONE = LocalDate.of(2026, 5, 1);
    private static final LocalDate DAY_TWO = LocalDate.of(2026, 5, 2);
    private static final LocalDate DAY_THREE = LocalDate.of(2026, 5, 3);

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

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
    ShareLinkRepository shareLinkRepository;

    @MockitoBean
    BreachedPasswordChecker breachedPasswordChecker;

    @MockitoBean
    TripEventPublisher tripEventPublisher;

    @BeforeEach
    void wireDefaults() {
        Trip trip = new Trip(TRIP_PUBLIC_ID, ALICE_ID, "Tokyo 2026", "Tokyo, Japan", DAY_ONE, DAY_THREE);
        ReflectionIds.setId(trip, TRIP_PK);
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(trip));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));
        when(userRepository.findById(ALICE_ID)).thenReturn(Optional.of(user(ALICE_ID, "Alice")));
    }

    @Test
    void getMissingNoteReturnsDefaultEmptyNote() throws Exception {
        when(dayNoteRepository.findById_TripIdAndId_DayDate(TRIP_PK, DAY_ONE))
            .thenReturn(Optional.empty());

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/notes/" + DAY_ONE)
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tripId").value(TRIP_PK))
            .andExpect(jsonPath("$.dayDate").value(DAY_ONE.toString()))
            .andExpect(jsonPath("$.note").value(""))
            .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void getOutsideTripRangeReturns400() throws Exception {
        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/notes/2099-01-01")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("day_out_of_range"));
    }

    @Test
    void listReturnsNotesInRangeWithAttribution() throws Exception {
        DayNote first = note(DAY_ONE, "Book breakfast");
        DayNote second = note(DAY_TWO, "Check reservation");
        when(dayNoteRepository.findAllInDateRange(TRIP_PK, DAY_ONE, DAY_THREE))
            .thenReturn(List.of(first, second));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/notes")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].note").value("Book breakfast"))
            .andExpect(jsonPath("$[1].note").value("Check reservation"))
            .andExpect(jsonPath("$[0].updatedByUserDisplayName").value("Alice"));
    }

    @Test
    void updateCreatesNoteAndReturnsAttribution() throws Exception {
        when(dayNoteRepository.findById_TripIdAndId_DayDate(TRIP_PK, DAY_TWO))
            .thenReturn(Optional.empty());
        when(dayNoteRepository.save(any(DayNote.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(put("/api/trips/" + TRIP_PUBLIC_ID + "/notes/" + DAY_TWO)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("note", "Check reservation email"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dayDate").value(DAY_TWO.toString()))
            .andExpect(jsonPath("$.note").value("Check reservation email"))
            .andExpect(jsonPath("$.updatedByUserDisplayName").value("Alice"));

        verify(tripEventPublisher).publishAfterCommit(eq(TRIP_PK), argThat(event ->
            event.type().equals("note.updated")
                && event.activityId() == null
                && event.dayDate().equals(DAY_TWO)));
    }

    @Test
    void updateCanClearExistingNote() throws Exception {
        DayNote existing = note(DAY_TWO, "Old note");
        when(dayNoteRepository.findById_TripIdAndId_DayDate(TRIP_PK, DAY_TWO))
            .thenReturn(Optional.of(existing));
        when(dayNoteRepository.save(any(DayNote.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(put("/api/trips/" + TRIP_PUBLIC_ID + "/notes/" + DAY_TWO)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("note", ""))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.note").value(""));

        verify(tripEventPublisher).publishAfterCommit(eq(TRIP_PK), argThat(event ->
            event.type().equals("note.updated")
                && event.activityId() == null
                && event.dayDate().equals(DAY_TWO)));
    }

    @Test
    void updateOutsideTripRangeReturns400() throws Exception {
        mvc.perform(put("/api/trips/" + TRIP_PUBLIC_ID + "/notes/2099-01-01")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("note", "Nope"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("day_out_of_range"));
    }

    @Test
    void viewerCannotUpdateNote() throws Exception {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.VIEWER)));

        mvc.perform(put("/api/trips/" + TRIP_PUBLIC_ID + "/notes/" + DAY_TWO)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("note", "Nope"))))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));
    }

    private String bearerFor(long userId) {
        return "Bearer " + realJwtService.issueAccessToken(userId);
    }

    private static User user(long id, String displayName) {
        User user = new User(displayName.toLowerCase() + "@example.com", "hash", displayName);
        ReflectionIds.setId(user, id);
        return user;
    }

    private static DayNote note(LocalDate dayDate, String text) {
        DayNote dayNote = new DayNote(TRIP_PK, dayDate, text);
        dayNote.setUpdatedByUserId(ALICE_ID);
        return dayNote;
    }
}
