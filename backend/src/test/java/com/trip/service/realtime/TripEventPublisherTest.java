package com.trip.service.realtime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class TripEventPublisherTest {

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void publishesImmediatelyOutsideTransaction() {
        TripEventBroker broker = mock(TripEventBroker.class);
        TripEventPublisher publisher = new TripEventPublisher(broker);
        TripEvent event = TripEvent.activityUpdated("abc23def45gh", 10L, LocalDate.of(2026, 5, 1));

        publisher.publishAfterCommit(42L, event);

        verify(broker).publish(42L, event);
    }

    @Test
    void defersPublishUntilAfterCommit() {
        TripEventBroker broker = mock(TripEventBroker.class);
        TripEventPublisher publisher = new TripEventPublisher(broker);
        TripEvent event = TripEvent.activityUpdated("abc23def45gh", 10L, LocalDate.of(2026, 5, 1));

        TransactionSynchronizationManager.initSynchronization();
        publisher.publishAfterCommit(42L, event);

        verifyNoInteractions(broker);
        TransactionSynchronizationManager.getSynchronizations()
            .forEach(synchronization -> synchronization.afterCommit());
        verify(broker).publish(42L, event);
    }

    @Test
    void publishesThenDisconnectsAfterCommit() {
        TripEventBroker broker = mock(TripEventBroker.class);
        TripEventPublisher publisher = new TripEventPublisher(broker);
        TripEvent event = TripEvent.shareLinksChanged("abc23def45gh");

        publisher.publishAndDisconnectAfterCommit(42L, event);

        verify(broker).publish(42L, event);
        verify(broker).disconnect(42L);
        verifyNoMoreInteractions(broker);
    }
}
