package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import com.trip.domain.Activity;
import com.trip.domain.ActivityCategory;
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
import com.trip.service.trip.ReflectionIds;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ActivityControllerTest {

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

    private Trip trip;

    @BeforeEach
    void wireDefaults() {
        trip = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "Tokyo 2026", DAY_ONE, DAY_THREE);
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(trip));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));
        when(userRepository.findById(ALICE_ID)).thenReturn(Optional.of(user(ALICE_ID, "Alice")));
    }

    @Test
    void createReturns201WithComputedOrderAndAttribution() throws Exception {
        when(activityRepository.countByTripId(TRIP_PK)).thenReturn(1L);
        when(activityRepository.findMaxOrderIndexForDay(TRIP_PK, DAY_TWO)).thenReturn(1);
        when(activityRepository.save(any(Activity.class))).thenAnswer(invocation -> {
            Activity saved = invocation.getArgument(0);
            ReflectionIds.setId(saved, 501L);
            return saved;
        });

        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .queryParam("dayDate", DAY_TWO.toString())
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "MEAL",
                    "title", "Tsukiji sushi",
                    "startTime", "09:00"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(501))
            .andExpect(jsonPath("$.dayDate").value(DAY_TWO.toString()))
            .andExpect(jsonPath("$.orderIndex").value(2))
            .andExpect(jsonPath("$.createdByUserDisplayName").value("Alice"))
            .andExpect(jsonPath("$.updatedByUserDisplayName").value("Alice"));
    }

    @Test
    void createOutsideTripRangeReturns400() throws Exception {
        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .queryParam("dayDate", "2099-01-01")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "MEAL",
                    "title", "Too far"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("day_out_of_range"));
    }

    @Test
    void listAllowsViewerAndReturnsActivities() throws Exception {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.VIEWER)));
        Activity meal = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "Breakfast", 0);
        Activity museum = activity(2L, TRIP_PK, DAY_TWO, ActivityCategory.ACTIVITY, "Museum", 0);
        meal.setUpdatedByUserId(ALICE_ID);
        museum.setUpdatedByUserId(ALICE_ID);
        when(activityRepository.findAllInDateRange(TRIP_PK, DAY_ONE, DAY_THREE))
            .thenReturn(List.of(meal, museum));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID + "/activities")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].title").value("Breakfast"))
            .andExpect(jsonPath("$[1].title").value("Museum"))
            .andExpect(jsonPath("$[0].updatedByUserDisplayName").value("Alice"));
    }

    @Test
    void updateAsViewerReturns404BeforeActivityLookup() throws Exception {
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.VIEWER)));

        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID + "/activities/1")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("title", "Nope"))))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));

        verify(activityRepository, never()).findById(1L);
    }

    @Test
    void updateMismatchedActivityTripReturns404() throws Exception {
        Activity foreign = activity(1L, 99L, DAY_ONE, ActivityCategory.MEAL, "Foreign", 0);
        when(activityRepository.findById(1L)).thenReturn(Optional.of(foreign));

        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID + "/activities/1")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("title", "Nope"))))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void updateReturnsChangedActivity() throws Exception {
        Activity activity = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "Breakfast", 0);
        when(activityRepository.findById(1L)).thenReturn(Optional.of(activity));
        when(activityRepository.save(any(Activity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID + "/activities/1")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "category", "ACTIVITY",
                    "title", "Museum"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.category").value("ACTIVITY"))
            .andExpect(jsonPath("$.title").value("Museum"))
            .andExpect(jsonPath("$.updatedByUserDisplayName").value("Alice"));
    }

    @Test
    void deleteReturns204() throws Exception {
        Activity activity = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "Breakfast", 0);
        when(activityRepository.findById(1L)).thenReturn(Optional.of(activity));

        mvc.perform(delete("/api/trips/" + TRIP_PUBLIC_ID + "/activities/1")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isNoContent());

        verify(activityRepository).delete(activity);
    }

    @Test
    void reorderUpdatesProvidedOrderAndAppendsRest() throws Exception {
        Activity first = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "First", 0);
        Activity second = activity(2L, TRIP_PK, DAY_ONE, ActivityCategory.ACTIVITY, "Second", 1);
        Activity third = activity(3L, TRIP_PK, DAY_ONE, ActivityCategory.SNACK, "Third", 2);
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_PK, DAY_ONE))
            .thenReturn(List.of(first, second, third));

        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/days/" + DAY_ONE + "/order")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("activityIds", List.of(3L, 1L)))))
            .andExpect(status().isNoContent());

        org.assertj.core.api.Assertions.assertThat(third.getOrderIndex()).isZero();
        org.assertj.core.api.Assertions.assertThat(first.getOrderIndex()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(second.getOrderIndex()).isEqualTo(2);
    }

    @Test
    void reorderRejectsDuplicateIds() throws Exception {
        Activity first = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "First", 0);
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_PK, DAY_ONE))
            .thenReturn(List.of(first));

        mvc.perform(post("/api/trips/" + TRIP_PUBLIC_ID + "/days/" + DAY_ONE + "/order")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of("activityIds", List.of(1L, 1L)))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("duplicate_activity_ids"));
    }

    @Test
    void moveWithinDayKeepsSequentialOrderWhenMovingDown() throws Exception {
        Activity first = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "First", 0);
        Activity second = activity(2L, TRIP_PK, DAY_ONE, ActivityCategory.ACTIVITY, "Second", 1);
        Activity third = activity(3L, TRIP_PK, DAY_ONE, ActivityCategory.SNACK, "Third", 2);
        when(activityRepository.findById(1L)).thenReturn(Optional.of(first));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_PK, DAY_ONE))
            .thenReturn(List.of(first, second, third));
        when(activityRepository.save(any(Activity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(post("/api/activities/1/move")
                .queryParam("publicId", TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "dayDate", DAY_ONE.toString(),
                    "orderIndex", 2))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.orderIndex").value(2));

        org.assertj.core.api.Assertions.assertThat(second.getOrderIndex()).isZero();
        org.assertj.core.api.Assertions.assertThat(third.getOrderIndex()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(first.getOrderIndex()).isEqualTo(2);
    }

    @Test
    void moveAcrossDaysShiftsSourceAndDestinationIndexes() throws Exception {
        Activity moving = activity(1L, TRIP_PK, DAY_ONE, ActivityCategory.MEAL, "Move me", 1);
        Activity sourceBefore = activity(2L, TRIP_PK, DAY_ONE, ActivityCategory.ACTIVITY, "Before", 0);
        Activity sourceAfter = activity(3L, TRIP_PK, DAY_ONE, ActivityCategory.SNACK, "After", 2);
        Activity destFirst = activity(4L, TRIP_PK, DAY_TWO, ActivityCategory.LODGING, "Hotel", 0);
        Activity destSecond = activity(5L, TRIP_PK, DAY_TWO, ActivityCategory.TRANSPORT, "Train", 1);
        when(activityRepository.findById(1L)).thenReturn(Optional.of(moving));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_PK, DAY_ONE))
            .thenReturn(List.of(sourceBefore, moving, sourceAfter));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_PK, DAY_TWO))
            .thenReturn(List.of(destFirst, destSecond));
        when(activityRepository.save(any(Activity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mvc.perform(post("/api/activities/1/move")
                .queryParam("publicId", TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(Map.of(
                    "dayDate", DAY_TWO.toString(),
                    "orderIndex", 1))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dayDate").value(DAY_TWO.toString()))
            .andExpect(jsonPath("$.orderIndex").value(1));

        org.assertj.core.api.Assertions.assertThat(sourceBefore.getOrderIndex()).isZero();
        org.assertj.core.api.Assertions.assertThat(sourceAfter.getOrderIndex()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(destFirst.getOrderIndex()).isZero();
        org.assertj.core.api.Assertions.assertThat(destSecond.getOrderIndex()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(moving.getOrderIndex()).isEqualTo(1);
    }

    private String bearerFor(long userId) {
        return "Bearer " + realJwtService.issueAccessToken(userId);
    }

    private static User user(long id, String displayName) {
        User user = new User(displayName.toLowerCase() + "@example.com", "hash", displayName);
        ReflectionIds.setId(user, id);
        return user;
    }

    private static Trip trip(long id, String publicId, long ownerId, String name,
                             LocalDate startDate, LocalDate endDate) {
        Trip trip = new Trip(publicId, ownerId, name, "Tokyo, Japan", startDate, endDate);
        ReflectionIds.setId(trip, id);
        return trip;
    }

    private static Activity activity(long id, long tripId, LocalDate dayDate,
                                     ActivityCategory category, String title, int orderIndex) {
        Activity activity = new Activity(tripId, dayDate, category, title);
        ReflectionIds.setId(activity, id);
        activity.setOrderIndex(orderIndex);
        activity.setCreatedByUserId(ALICE_ID);
        activity.setUpdatedByUserId(ALICE_ID);
        return activity;
    }
}
