package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

class AuthEmailTransactionRunnerTest {

    @Test
    void commitsTokenWorkBeforeRunningProviderCallWithoutTransaction() {
        List<String> events = new ArrayList<>();
        AuthEmailTransactionRunner runner = new AuthEmailTransactionRunner(
            new RecordingTransactionManager(events));

        runner.inNewTransaction(status -> {
            events.add("token:written");
            return null;
        });
        runner.outsideTransaction(status -> {
            events.add("provider:send");
            return null;
        });

        assertThat(events).containsSubsequence(
            "begin:requires_new",
            "token:written",
            "commit:requires_new",
            "begin:not_supported",
            "provider:send");
    }

    private static final class RecordingTransactionManager implements PlatformTransactionManager {
        private final List<String> events;
        private final List<Integer> propagationBehaviors = new ArrayList<>();

        private RecordingTransactionManager(List<String> events) {
            this.events = events;
        }

        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            propagationBehaviors.add(definition.getPropagationBehavior());
            events.add("begin:" + propagationName(definition.getPropagationBehavior()));
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
            int propagation = propagationBehaviors.remove(0);
            events.add("commit:" + propagationName(propagation));
        }

        @Override
        public void rollback(TransactionStatus status) {
            int propagation = propagationBehaviors.remove(0);
            events.add("rollback:" + propagationName(propagation));
        }

        private static String propagationName(int propagation) {
            return switch (propagation) {
                case TransactionDefinition.PROPAGATION_REQUIRES_NEW -> "requires_new";
                case TransactionDefinition.PROPAGATION_NOT_SUPPORTED -> "not_supported";
                default -> "other";
            };
        }
    }
}
