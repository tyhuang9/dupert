package com.trip.config;

import java.net.URI;
import java.util.Locale;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Fails closed when a deploy-like environment is missing transport hardening.
 */
@Component
public class SecurityDeploymentValidator implements ApplicationRunner {

    private final AppProperties appProperties;
    private final SecureProperties secureProperties;
    private final Environment environment;

    public SecurityDeploymentValidator(AppProperties appProperties,
                                       SecureProperties secureProperties,
                                       Environment environment) {
        this.appProperties = appProperties;
        this.secureProperties = secureProperties;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!requiresTransportHardening()) {
            return;
        }
        if (!appProperties.getCookies().isSecure() || !secureProperties.getHsts().isEnabled()) {
            throw new IllegalStateException(
                "Production-like deployments require app.cookies.secure=true and secure.hsts.enabled=true");
        }
    }

    boolean requiresTransportHardening() {
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            return true;
        }
        String origins = appProperties.getFrontendOrigin();
        if (origins == null || origins.isBlank()) {
            return false;
        }
        for (String origin : origins.split(",")) {
            if (!origin.isBlank() && !isLocalOrigin(origin.strip())) {
                return true;
            }
        }
        return false;
    }

    private static boolean isLocalOrigin(String origin) {
        try {
            URI uri = URI.create(origin);
            String host = uri.getHost();
            if (host == null) {
                return false;
            }
            String normalized = host.toLowerCase(Locale.ROOT);
            return "localhost".equals(normalized)
                || "127.0.0.1".equals(normalized)
                || "::1".equals(normalized);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }
}
