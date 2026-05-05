package com.trip.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Strongly-typed view of the {@code app.*} tree in application.yml. Everything here
 * is pulled from environment variables; hard-coded defaults would be a security
 * smell. Missing values are validated at boot by {@link AppPropertiesValidator}.
 */
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** Comma-separated list of exact origins allowed by CORS. */
    private String frontendOrigin = "";

    /** Hex-encoded HS256 secret; must decode to at least 32 bytes. */
    private String jwtSecret = "";

    /** Hex pepper used when hashing emails for log lines. */
    private String logEmailPepper = "";

    public String getFrontendOrigin() {
        return frontendOrigin;
    }

    public void setFrontendOrigin(String frontendOrigin) {
        this.frontendOrigin = frontendOrigin == null ? "" : frontendOrigin;
    }

    public String getJwtSecret() {
        return jwtSecret;
    }

    public void setJwtSecret(String jwtSecret) {
        this.jwtSecret = jwtSecret == null ? "" : jwtSecret;
    }

    public String getLogEmailPepper() {
        return logEmailPepper;
    }

    public void setLogEmailPepper(String logEmailPepper) {
        this.logEmailPepper = logEmailPepper == null ? "" : logEmailPepper;
    }
}
