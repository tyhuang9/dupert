package com.trip.config;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Neon (and most managed Postgres hosts) hand out connection strings in the form
 * <code>postgresql://USER:PASS@HOST[:PORT]/DB?params</code>. Spring's JDBC layer wants a
 * <code>jdbc:postgresql://HOST[:PORT]/DB?params</code> URL with <code>username</code> and
 * <code>password</code> as separate properties.
 *
 * <p>Rather than make every new developer hand-edit the Neon string, this processor detects a
 * raw <code>postgresql://</code> value in <code>DATABASE_URL</code> and transparently splits it
 * into <code>spring.datasource.url</code> / <code>.username</code> / <code>.password</code>.
 * Values that already start with <code>jdbc:</code> are passed through unchanged.
 */
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {

    private static final String PROPERTY_SOURCE_NAME = "databaseUrlExpansion";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        String raw = env.getProperty("DATABASE_URL");
        if (raw == null || raw.isBlank()) {
            return;
        }
        if (raw.startsWith("jdbc:")) {
            // Already JDBC-flavored — trust the user.
            Map<String, Object> props = new HashMap<>();
            props.put("spring.datasource.url", raw);
            env.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, props));
            return;
        }
        if (!raw.startsWith("postgresql://") && !raw.startsWith("postgres://")) {
            // Unknown scheme — let Spring try and fail with its own clear error.
            return;
        }
        try {
            // URI won't parse the non-standard "postgresql" scheme cleanly in all JDKs, so
            // normalise to something URI understands then read the parts.
            String forUri = raw.replaceFirst("^postgres(ql)?://", "http://");
            URI u = URI.create(forUri);
            String userInfo = u.getUserInfo();
            String username = null;
            String password = null;
            if (userInfo != null) {
                int colon = userInfo.indexOf(':');
                if (colon >= 0) {
                    username = urlDecode(userInfo.substring(0, colon));
                    password = urlDecode(userInfo.substring(colon + 1));
                } else {
                    username = urlDecode(userInfo);
                }
            }
            StringBuilder jdbc = new StringBuilder("jdbc:postgresql://");
            jdbc.append(u.getHost());
            if (u.getPort() > 0) {
                jdbc.append(':').append(u.getPort());
            }
            if (u.getRawPath() != null) {
                jdbc.append(u.getRawPath());
            }
            if (u.getRawQuery() != null) {
                jdbc.append('?').append(u.getRawQuery());
            }

            Map<String, Object> props = new HashMap<>();
            props.put("spring.datasource.url", jdbc.toString());
            if (username != null) {
                props.put("spring.datasource.username", username);
            }
            if (password != null) {
                props.put("spring.datasource.password", password);
            }
            env.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, props));
        } catch (IllegalArgumentException ignored) {
            // Bad URL — fall through; Spring will surface the error.
        }
    }

    private static String urlDecode(String s) {
        return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
