package com.trip.service.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.trip.domain.Activity;
import com.trip.domain.ActivityCategory;
import com.trip.domain.Trip;
import com.trip.domain.TripRole;
import com.trip.repo.ActivityRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.IdDisplayName;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.realtime.TripEventPublisher;
import com.trip.service.trip.ReflectionIds;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.service.trip.TripActor;
import com.trip.web.dto.activity.ActivityResponse;

@ExtendWith(MockitoExtension.class)
class ActivityServiceTest {

    private static final String TRIP_PUBLIC_ID = "abc23def45gh";
    private static final long TRIP_ID = 42L;
    private static final LocalDate START_DATE = LocalDate.of(2026, 5, 1);
    private static final LocalDate END_DATE = LocalDate.of(2026, 5, 3);

    @Mock
    ActivityRepository activityRepository;

    @Mock
    TripRepository tripRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    GuestSessionRepository guestSessionRepository;

    @Mock
    TripAccessGuard tripAccessGuard;

    @Mock
    TripEventPublisher tripEventPublisher;

    private ActivityService activityService;

    @BeforeEach
    void setUp() {
        activityService = new ActivityService(activityRepository, tripRepository, userRepository,
            guestSessionRepository, tripAccessGuard, tripEventPublisher);
        Trip trip = new Trip(TRIP_PUBLIC_ID, 1L, "Tokyo", "Tokyo", START_DATE, END_DATE);
        ReflectionIds.setId(trip, TRIP_ID);
        when(tripAccessGuard.resolveForActor(eq(TRIP_PUBLIC_ID), any(TripActor.class)))
            .thenReturn(new ResolvedTrip(trip, TripRole.VIEWER));
    }

    @Test
    void listBatchesNarrowAttributionLookupsAndKeepsMissingNamesNull() {
        Activity userCreated = activity(1L, "Breakfast");
        userCreated.setCreatedByUserId(10L);
        userCreated.setUpdatedByUserId(11L);
        Activity guestCreated = activity(2L, "Museum");
        guestCreated.setCreatedByGuestSessionId(20L);
        guestCreated.setUpdatedByGuestSessionId(21L);
        Activity missingActor = activity(3L, "Dinner");
        missingActor.setCreatedByUserId(12L);

        when(activityRepository.findAllVisibleForTrip(TRIP_ID, START_DATE, END_DATE))
            .thenReturn(List.of(userCreated, guestCreated, missingActor));
        when(userRepository.findDisplayNamesByIdIn(any()))
            .thenReturn(List.of(
                new IdDisplayName(10L, "Alice"),
                new IdDisplayName(11L, "Bob")));
        when(guestSessionRepository.findDisplayNamesByIdIn(any()))
            .thenReturn(List.of(
                new IdDisplayName(20L, "Guest Amy"),
                new IdDisplayName(21L, "Guest Ben")));

        List<ActivityResponse> result = activityService.listActivities(
            TRIP_PUBLIC_ID, TripActor.user(1L));

        assertThat(result)
            .extracting(ActivityResponse::createdByUserDisplayName,
                ActivityResponse::updatedByUserDisplayName)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Alice", "Bob"),
                org.assertj.core.groups.Tuple.tuple("Guest Amy", "Guest Ben"),
                org.assertj.core.groups.Tuple.tuple(null, null));
        verify(userRepository).findDisplayNamesByIdIn(argThat(ids ->
            ids.equals(Set.of(10L, 11L, 12L))));
        verify(guestSessionRepository).findDisplayNamesByIdIn(argThat(ids ->
            ids.equals(Set.of(20L, 21L))));
        verify(userRepository, never()).findById(any());
        verify(guestSessionRepository, never()).findById(any());
    }

    private static Activity activity(long id, String title) {
        Activity activity = new Activity(TRIP_ID, START_DATE, ActivityCategory.ACTIVITY, title);
        ReflectionIds.setId(activity, id);
        return activity;
    }
}
