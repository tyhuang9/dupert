package com.trip.service.auth;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Keeps authentication-email database work deliberately short.
 *
 * <p>Token state is committed in its own transaction before an external provider is
 * contacted. Provider I/O then runs with any ambient transaction suspended, so a slow
 * email provider cannot retain a JDBC connection.</p>
 */
@Component
public class AuthEmailTransactionRunner {

    private final TransactionOperations databaseTransactions;
    private final TransactionOperations outsideTransactions;

    public AuthEmailTransactionRunner(ObjectProvider<PlatformTransactionManager> transactionManager) {
        this(transactionManager.getIfAvailable());
    }

    AuthEmailTransactionRunner() {
        this(directTransactions(), directTransactions());
    }

    AuthEmailTransactionRunner(TransactionOperations databaseTransactions,
                               TransactionOperations outsideTransactions) {
        this.databaseTransactions = databaseTransactions;
        this.outsideTransactions = outsideTransactions;
    }

    AuthEmailTransactionRunner(PlatformTransactionManager transactionManager) {
        this(
            transactionManager == null
                ? directTransactions()
                : transactionTemplate(transactionManager, TransactionDefinition.PROPAGATION_REQUIRES_NEW),
            transactionManager == null
                ? directTransactions()
                : transactionTemplate(transactionManager, TransactionDefinition.PROPAGATION_NOT_SUPPORTED));
    }

    public <T> T inNewTransaction(TransactionCallback<T> callback) {
        return databaseTransactions.execute(callback);
    }

    public <T> T outsideTransaction(TransactionCallback<T> callback) {
        return outsideTransactions.execute(callback);
    }

    private static TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager,
                                                            int propagationBehavior) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(propagationBehavior);
        return template;
    }

    private static TransactionOperations directTransactions() {
        return new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(new SimpleTransactionStatus());
            }
        };
    }
}
