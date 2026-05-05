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

    /** Cookie-related toggles. */
    private Cookies cookies = new Cookies();

    /**
     * If {@code true}, trust {@code X-Forwarded-For} for client-IP resolution. Default
     * {@code false}: when the app is exposed directly (no reverse proxy in front), an
     * attacker can otherwise spoof their rate-limit key by sending the header. Set to
     * {@code true} only behind a proxy that overwrites (not appends) the header — Fly
     * and Vercel both do this; nginx by default does not.
     */
    private boolean trustProxy = false;

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

    public Cookies getCookies() {
        return cookies;
    }

    public void setCookies(Cookies cookies) {
        this.cookies = cookies == null ? new Cookies() : cookies;
    }

    public boolean isTrustProxy() {
        return trustProxy;
    }

    public void setTrustProxy(boolean trustProxy) {
        this.trustProxy = trustProxy;
    }

    /**
     * Cookie attribute toggles. {@code secure} is {@code false} in dev (HTTP localhost)
     * and {@code true} in prod via the active profile.
     */
    public static class Cookies {
        private boolean secure = false;

        public boolean isSecure() {
            return secure;
        }

        public void setSecure(boolean secure) {
            this.secure = secure;
        }
    }
}
