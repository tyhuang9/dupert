package com.trip.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.Activity;
import com.trip.domain.ActivityCategory;
import com.trip.domain.DayNote;
import com.trip.domain.GuestSession;
import com.trip.domain.ShareLink;
import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.ActivityRepository;
import com.trip.repo.DayNoteRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.RefreshTokenRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.service.share.ShareTokenService;
import com.trip.service.trip.ReflectionIds;
import com.trip.web.auth.GuestAuthenticationFilter;
import com.trip.web.auth.GuestSessionCookie;

import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GuestAccessControllerTest {

    private static final long ALICE_ID = 100L;
    private static final long TRIP_PK = 42L;
    private static final long SHARE_LINK_ID = 501L;
    private static final long GUEST_ID = 701L;
    private static final String TRIP_PUBLIC_ID = "abc23def45gh";
    private static final String RAW_GUEST_TOKEN = "guestabcdefghijklmnopqrstuvwxyz123456";
    private static final LocalDate DAY_ONE = LocalDate.of(2026, 5, 1);
    private static final LocalDate DAY_TWO = LocalDate.of(2026, 5, 2);

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    ShareTokenService shareTokenService;

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

    private Trip trip;
    private GuestSession guestSession;
    private ShareLink shareLink;

    @BeforeEach
    void wireDefaults() {
        trip = new Trip(TRIP_PUBLIC_ID, ALICE_ID, "Tokyo 2026", "Tokyo, Japan", DAY_ONE, DAY_TWO);
        ReflectionIds.setId(trip, TRIP_PK);
        guestSession = new GuestSession(
            SHARE_LINK_ID,
            shareTokenService.sha256Hex(RAW_GUEST_TOKEN),
            "Guest Alice");
        ReflectionIds.setId(guestSession, GUEST_ID);
        shareLink = link(TripRole.VIEWER);

        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(trip));
        when(guestSessionRepository.findByTokenHash(shareTokenService.sha256Hex(RAW_GUEST_TOKEN)))
            .thenReturn(Optional.of(guestSession));
        when(guestSessionRepository.findById(GUEST_ID)).thenReturn(Optional.of(guestSession));
        when(shareLinkRepository.findById(SHARE_LINK_ID)).thenReturn(Optional.of(shareLink));
    }

    @Test
    void guestCookieCanReadTripAndActivities() throws Exception {
        Activity activity = activity(1L, ActivityCategory.MEAL, "Breakfast", 0);
        activity.setUpdatedByGuestSessionId(GUEST_ID);
        when(activityRepository.findAllVisibleForTrip(TRIP_PK, DAY_ONE, DAY_TWO))
            .thenReturn(List.of(activity));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .cookie(guestCookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publicId").value(TRIP_PUBLIC_ID))
            .andExpect(jsonPath("$.role").value("VIEWER"));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .cookie(guestCookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].title").value("Breakfast"))
            .andExpect(jsonPath("$[0].updatedByUserDisplayName").value("Guest Alice"));
    }

    @Test
    void viewerGuestWriteReturns403() throws Exception {
        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .queryParam("dayDate", DAY_ONE.toString())
                .cookie(guestCookie())
                .header(GuestAuthenticationFilter.GUEST_WRITE_HEADER, "1")
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "MEAL",
                    "title", "Nope"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("forbidden"));

        verify(activityRepository, never()).save(any(Activity.class));
    }

    @Test
    void editorGuestWriteRequiresHeader() throws Exception {
        shareLink = link(TripRole.EDITOR);
        when(shareLinkRepository.findById(SHARE_LINK_ID)).thenReturn(Optional.of(shareLink));

        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .queryParam("dayDate", DAY_ONE.toString())
                .cookie(guestCookie())
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "MEAL",
                    "title", "No header"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("guest_write_header_required"));

        verify(activityRepository, never()).save(any(Activity.class));
    }

    @Test
    void editorGuestCanCreateActivityWithGuestAttribution() throws Exception {
        shareLink = link(TripRole.EDITOR);
        when(shareLinkRepository.findById(SHARE_LINK_ID)).thenReturn(Optional.of(shareLink));
        when(activityRepository.countByTripId(TRIP_PK)).thenReturn(0L);
        when(activityRepository.findMaxOrderIndexForDay(TRIP_PK, DAY_ONE)).thenReturn(-1);
        when(activityRepository.save(any(Activity.class))).thenAnswer(invocation -> {
            Activity saved = invocation.getArgument(0);
            ReflectionIds.setId(saved, 900L);
            return saved;
        });

        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .queryParam("dayDate", DAY_ONE.toString())
                .cookie(guestCookie())
                .header(GuestAuthenticationFilter.GUEST_WRITE_HEADER, "1")
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "MEAL",
                    "title", "Guest ramen"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(900))
            .andExpect(jsonPath("$.createdByUserDisplayName").value("Guest Alice"))
            .andExpect(jsonPath("$.updatedByUserDisplayName").value("Guest Alice"));

        ArgumentCaptor<Activity> saved = ArgumentCaptor.forClass(Activity.class);
        verify(activityRepository).save(saved.capture());
        assertThat(saved.getValue().getCreatedByUserId()).isNull();
        assertThat(saved.getValue().getUpdatedByUserId()).isNull();
        assertThat(saved.getValue().getCreatedByGuestSessionId()).isEqualTo(GUEST_ID);
        assertThat(saved.getValue().getUpdatedByGuestSessionId()).isEqualTo(GUEST_ID);
    }

    @Test
    void editorGuestCanUpdateDayNoteWithGuestAttribution() throws Exception {
        shareLink = link(TripRole.EDITOR);
        when(shareLinkRepository.findById(SHARE_LINK_ID)).thenReturn(Optional.of(shareLink));
        when(dayNoteRepository.findById_TripIdAndId_DayDate(TRIP_PK, DAY_ONE))
            .thenReturn(Optional.empty());
        when(dayNoteRepository.save(any(DayNote.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(put("/api/trips/" + TRIP_PUBLIC_ID + "/notes/" + DAY_ONE)
                .cookie(guestCookie())
                .header(GuestAuthenticationFilter.GUEST_WRITE_HEADER, "1")
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("note", "Guest note"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.note").value("Guest note"))
            .andExpect(jsonPath("$.updatedByUserDisplayName").value("Guest Alice"));

        ArgumentCaptor<DayNote> saved = ArgumentCaptor.forClass(DayNote.class);
        verify(dayNoteRepository).save(saved.capture());
        assertThat(saved.getValue().getUpdatedByUserId()).isNull();
        assertThat(saved.getValue().getUpdatedByGuestSessionId()).isEqualTo(GUEST_ID);
    }

    @Test
    void revokedGuestCookieReturns401() throws Exception {
        shareLink.revoke(java.time.OffsetDateTime.now());

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .cookie(guestCookie()))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"));
    }

    private Cookie guestCookie() {
        return new Cookie(GuestSessionCookie.COOKIE_NAME, RAW_GUEST_TOKEN);
    }

    private ShareLink link(TripRole role) {
        ShareLink link = new ShareLink(TRIP_PK, "share-token-hash", role, true, ALICE_ID, null);
        ReflectionIds.setId(link, SHARE_LINK_ID);
        return link;
    }

    private static Activity activity(long id, ActivityCategory category, String title, int orderIndex) {
        Activity activity = new Activity(TRIP_PK, DAY_ONE, category, title);
        ReflectionIds.setId(activity, id);
        activity.setOrderIndex(orderIndex);
        return activity;
    }
}
