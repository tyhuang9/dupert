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
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            broker.publish(tripId, event);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                broker.publish(tripId, event);
            }
        });
    }
}
