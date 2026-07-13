package com.trip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Executor;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class GoogleMapsAsyncConfigTest {

    @Test
    void configuresOneBoundedThreeWorkerPhotoExecutor() {
        Executor configured = new GoogleMapsAsyncConfig().googlePhotoExecutor();
        ThreadPoolTaskExecutor executor = (ThreadPoolTaskExecutor) configured;

        try {
            assertThat(executor.getCorePoolSize()).isEqualTo(3);
            assertThat(executor.getMaxPoolSize()).isEqualTo(3);
            assertThat(executor.getThreadPoolExecutor().getQueue().remainingCapacity()).isEqualTo(30);
        } finally {
            executor.shutdown();
        }
    }
}
