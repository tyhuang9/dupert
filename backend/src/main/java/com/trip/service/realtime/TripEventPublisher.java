package com.trip.service.realtime;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Publishes realtime events only after the surrounding transaction commits, so
 * subscribers never refetch before the write is visible.
 */
@Component
public class TripEventPublisher {

    private final TripEventBroker broker;

    public TripEventPublisher(TripEventBroker broker) {
        this.broker = broker;
    }

    public void publishAfterCommit(Long tripId, TripEvent event) {
        afterCommitOrNow(() -> broker.publish(tripId, event));
    }

    public void publishAndDisconnectAfterCommit(Long tripId, TripEvent event) {
        afterCommitOrNow(() -> {
            broker.publish(tripId, event);
            broker.disconnect(tripId);
        });
    }

    private void afterCommitOrNow(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
