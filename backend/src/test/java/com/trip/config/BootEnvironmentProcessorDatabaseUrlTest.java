package com.trip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.io.support.SpringFactoriesLoader;
import org.springframework.mock.env.MockEnvironment;

class BootEnvironmentProcessorDatabaseUrlTest {

    private final BootEnvironmentProcessor processor = new BootEnvironmentProcessor();

    @Test
    void rewritesPostgresDatabaseUrlIntoJdbcProperties() {
        MockEnvironment env = prodEnvironment()
                .withProperty(
                        "DATABASE_URL",
                        "postgresql://trip_user:p%40ss@db.example.com/tripdb?sslmode=require");

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://db.example.com/tripdb?sslmode=require");
        assertThat(env.getProperty("spring.datasource.username")).isEqualTo("trip_user");
        assertThat(env.getProperty("spring.datasource.password")).isEqualTo("p@ss");
    }

    @Test
    void stripsDockerEnvFileQuotesBeforeRewritingDatabaseUrl() {
        MockEnvironment env = prodEnvironment()
                .withProperty(
                        "DATABASE_URL",
                        "'postgresql://trip_user:p%40ss@db.example.com/tripdb?sslmode=require'");

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://db.example.com/tripdb?sslmode=require");
        assertThat(env.getProperty("spring.datasource.username")).isEqualTo("trip_user");
        assertThat(env.getProperty("spring.datasource.password")).isEqualTo("p@ss");
    }

    @Test
    void keepsJdbcUrlWhenAlreadyProvided() {
        MockEnvironment env = prodEnvironment()
                .withProperty(
                        "DATABASE_URL",
                        "\"jdbc:postgresql://db.example.com/tripdb?sslmode=require\"");

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://db.example.com/tripdb?sslmode=require");
    }

    @Test
    void isRegisteredAsSpringBootEnvironmentPostProcessor() {
        List<String> processors = SpringFactoriesLoader.loadFactoryNames(
                EnvironmentPostProcessor.class,
                BootEnvironmentProcessorDatabaseUrlTest.class.getClassLoader());

        assertThat(processors).contains(BootEnvironmentProcessor.class.getName());
    }

    private static MockEnvironment prodEnvironment() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        return env;
    }
}
