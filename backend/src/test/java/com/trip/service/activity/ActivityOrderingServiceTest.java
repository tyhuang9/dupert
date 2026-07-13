package com.trip.service.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.trip.domain.Activity;
import com.trip.domain.ActivityCategory;
import com.trip.domain.Trip;
import com.trip.domain.TripRole;
import com.trip.repo.ActivityRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.realtime.TripEventPublisher;
import com.trip.service.trip.ReflectionIds;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.service.trip.TripActor;
import com.trip.web.dto.activity.CreateActivityRequest;
import com.trip.web.dto.activity.MoveActivityRequest;
import com.trip.web.dto.activity.ReorderActivitiesRequest;
import com.trip.web.exception.ValidationException;

@ExtendWith(MockitoExtension.class)
class ActivityOrderingServiceTest {

    private static final String TRIP_PUBLIC_ID = "abc23def45gh";
    private static final long TRIP_ID = 42L;
    private static final LocalDate DAY_ONE = LocalDate.of(2026, 5, 1);
    private static final LocalDate DAY_TWO = LocalDate.of(2026, 5, 2);

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
        Trip trip = new Trip(TRIP_PUBLIC_ID, 1L, "Tokyo", "Tokyo", DAY_ONE, DAY_TWO);
        ReflectionIds.setId(trip, TRIP_ID);
        when(tripAccessGuard.resolveForActorAtLeast(eq(TRIP_PUBLIC_ID), any(TripActor.class),
            eq(TripRole.EDITOR))).thenReturn(new ResolvedTrip(trip, TripRole.EDITOR));
        when(tripRepository.findByIdForUpdate(TRIP_ID)).thenReturn(Optional.of(trip));
    }

    @Test
    void createLocksTheTripBeforeCheckingTheActivityCap() {
        when(activityRepository.countByTripId(TRIP_ID))
            .thenReturn(ActivityService.MAX_ACTIVITIES_PER_TRIP);

        assertThatThrownBy(() -> activityService.createActivity(TRIP_PUBLIC_ID, TripActor.user(1L), DAY_ONE,
            new CreateActivityRequest(ActivityCategory.MEAL, "Lunch", null, null, null,
                null, null, null, null, null)))
            .isInstanceOf(ValidationException.class)
            .hasMessageContaining("maximum number of activities");

        InOrder calls = inOrder(tripAccessGuard, tripRepository, activityRepository);
        calls.verify(tripAccessGuard).resolveForActorAtLeast(
            eq(TRIP_PUBLIC_ID), any(TripActor.class), eq(TripRole.EDITOR));
        calls.verify(tripRepository).findByIdForUpdate(TRIP_ID);
        calls.verify(activityRepository).countByTripId(TRIP_ID);
    }

    @Test
    void reorderUsesDistinctTemporaryPositionsBeforeFinalPositions() {
        Activity first = activity(1L, DAY_ONE, 0, "First");
        Activity second = activity(2L, DAY_ONE, 1, "Second");
        Activity third = activity(3L, DAY_ONE, 2, "Third");
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_ID, DAY_ONE))
            .thenReturn(List.of(first, second, third));

        PersistenceCapture persistence = capturePersistenceOperations();

        activityService.reorderActivitiesForDay(TRIP_PUBLIC_ID, DAY_ONE, TripActor.user(1L),
            new ReorderActivitiesRequest(List.of(3L, 1L)));

        assertThat(persistence.writes()).hasSize(6);
        assertThat(persistence.operations())
            .containsExactly("save", "save", "save", "flush", "save", "save", "save");
        assertThat(persistence.writes().subList(0, 3))
            .extracting(PositionWrite::orderIndex)
            .containsExactly(-1, -2, -3);
        assertThat(persistence.writes().subList(3, 6))
            .extracting(PositionWrite::orderIndex)
            .containsExactly(0, 1, 2);
        assertThat(List.of(third, first, second))
            .extracting(Activity::getOrderIndex)
            .containsExactly(0, 1, 2);
    }

    @Test
    void moveAcrossBucketsStagesBothBucketsBeforeFinalizingPositions() {
        Activity moving = activity(1L, DAY_ONE, 1, "Move me");
        Activity sourceFirst = activity(2L, DAY_ONE, 0, "Source");
        Activity destinationFirst = activity(3L, DAY_TWO, 0, "Destination");
        when(activityRepository.findById(1L)).thenReturn(Optional.of(moving));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_ID, DAY_ONE))
            .thenReturn(List.of(sourceFirst, moving));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_ID, DAY_TWO))
            .thenReturn(List.of(destinationFirst));

        PersistenceCapture persistence = capturePersistenceOperations();

        activityService.moveActivity(1L, TripActor.user(1L), TRIP_PUBLIC_ID,
            new MoveActivityRequest(DAY_TWO, 1));

        assertThat(persistence.writes()).hasSize(6);
        assertThat(persistence.operations())
            .containsExactly("save", "save", "save", "flush", "save", "save", "save");
        assertThat(persistence.writes().subList(0, 3))
            .allSatisfy(write -> assertThat(write.orderIndex()).isNegative());
        assertThat(sourceFirst.getOrderIndex()).isZero();
        assertThat(destinationFirst.getOrderIndex()).isZero();
        assertThat(moving.getDayDate()).isEqualTo(DAY_TWO);
        assertThat(moving.getOrderIndex()).isEqualTo(1);
    }

    @Test
    void deleteFlushesTheRemovalThenClosesTheRemainingPositionGap() {
        Activity first = activity(1L, DAY_ONE, 0, "First");
        Activity removed = activity(2L, DAY_ONE, 1, "Removed");
        Activity third = activity(3L, DAY_ONE, 2, "Third");
        when(activityRepository.findById(2L)).thenReturn(Optional.of(removed));
        when(activityRepository.findByTripIdAndDayDateOrderByOrderIndex(TRIP_ID, DAY_ONE))
            .thenReturn(List.of(first, removed, third));

        PersistenceCapture persistence = capturePersistenceOperations();

        activityService.deleteActivity(2L, TripActor.user(1L), TRIP_PUBLIC_ID);

        verify(activityRepository).delete(removed);
        assertThat(persistence.operations())
            .containsExactly("flush", "save", "save", "flush", "save", "save");
        assertThat(first.getOrderIndex()).isZero();
        assertThat(third.getOrderIndex()).isEqualTo(1);
    }

    private PersistenceCapture capturePersistenceOperations() {
        List<PositionWrite> writes = new ArrayList<>();
        List<String> operations = new ArrayList<>();
        doAnswer(invocation -> {
            Activity activity = invocation.getArgument(0);
            writes.add(new PositionWrite(activity.getId(), activity.getDayDate(), activity.getOrderIndex()));
            operations.add("save");
            return activity;
        }).when(activityRepository).save(any(Activity.class));
        doAnswer(invocation -> {
            operations.add("flush");
            return null;
        }).when(activityRepository).flush();
        return new PersistenceCapture(writes, operations);
    }

    private static Activity activity(long id, LocalDate dayDate, int orderIndex, String title) {
        Activity activity = new Activity(TRIP_ID, dayDate, ActivityCategory.ACTIVITY, title);
        ReflectionIds.setId(activity, id);
        activity.setOrderIndex(orderIndex);
        return activity;
    }

    private record PositionWrite(Long id, LocalDate dayDate, int orderIndex) {
    }

    private record PersistenceCapture(List<PositionWrite> writes, List<String> operations) {
    }
}
