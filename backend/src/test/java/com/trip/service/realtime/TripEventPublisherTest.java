package com.trip.service.realtime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

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
        TripEvent event = TripEvent.noteUpdated("abc23def45gh", LocalDate.of(2026, 5, 1));

        publisher.publishAfterCommit(42L, event);

        verify(broker).publish(42L, event);
    }

    @Test
    void defersPublishUntilAfterCommit() {
        TripEventBroker broker = mock(TripEventBroker.class);
        TripEventPublisher publisher = new TripEventPublisher(broker);
        TripEvent event = TripEvent.noteUpdated("abc23def45gh", LocalDate.of(2026, 5, 1));

        TransactionSynchronizationManager.initSynchronization();
        publisher.publishAfterCommit(42L, event);

        verifyNoInteractions(broker);
        TransactionSynchronizationManager.getSynchronizations()
            .forEach(synchronization -> synchronization.afterCommit());
        verify(broker).publish(42L, event);
    }
}
