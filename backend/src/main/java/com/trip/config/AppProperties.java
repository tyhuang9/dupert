package com.trip.config;

import java.time.Duration;

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

    /** Secret required by the local-only dev password reset helper. */
    private String devPasswordResetSecret = "";

    /** Backend-only Google Maps API key for server-side Google Maps web service calls. */
    private String googleMapsServerApiKey = "";

    /** Server-side Places details cache configuration. */
    private PlaceDetails placeDetails = new PlaceDetails();

    /** Server-side Google Maps cache configuration. */
    private GoogleMapsCache googleMapsCache = new GoogleMapsCache();

    /** Password-policy knobs (breached-password threshold, etc.). */
    private Password password = new Password();

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

    public String getDevPasswordResetSecret() {
        return devPasswordResetSecret;
    }

    public void setDevPasswordResetSecret(String devPasswordResetSecret) {
        this.devPasswordResetSecret = devPasswordResetSecret == null ? "" : devPasswordResetSecret;
    }

    public String getGoogleMapsServerApiKey() {
        return googleMapsServerApiKey;
    }

    public void setGoogleMapsServerApiKey(String googleMapsServerApiKey) {
        this.googleMapsServerApiKey = googleMapsServerApiKey == null ? "" : googleMapsServerApiKey;
    }

    public PlaceDetails getPlaceDetails() {
        return placeDetails;
    }

    public void setPlaceDetails(PlaceDetails placeDetails) {
        this.placeDetails = placeDetails == null ? new PlaceDetails() : placeDetails;
    }

    public GoogleMapsCache getGoogleMapsCache() {
        return googleMapsCache;
    }

    public void setGoogleMapsCache(GoogleMapsCache googleMapsCache) {
        this.googleMapsCache = googleMapsCache == null ? new GoogleMapsCache() : googleMapsCache;
    }

    public Password getPassword() {
        return password;
    }

    public void setPassword(Password password) {
        this.password = password == null ? new Password() : password;
    }

    public boolean isTrustProxy() {
        return trustProxy;
    }

    public void setTrustProxy(boolean trustProxy) {
        this.trustProxy = trustProxy;
    }

    /**
     * Password-related knobs.
     *
     * <p>{@code breachThreshold} is the minimum HIBP "seen-count" at which we reject a
     * candidate password. Default {@code 1}: any appearance in the breach corpus is
     * disqualifying.
     */
    public static class Password {
        private int breachThreshold = 1;

        public int getBreachThreshold() {
            return breachThreshold;
        }

        public void setBreachThreshold(int breachThreshold) {
            this.breachThreshold = breachThreshold;
        }
    }

    /** Places details cache TTLs. */
    public static class PlaceDetails {
        private Duration basicTtl = Duration.ofDays(7);
        private Duration expandedTtl = Duration.ofDays(1);

        public Duration getBasicTtl() {
            return basicTtl;
        }

        public void setBasicTtl(Duration basicTtl) {
            this.basicTtl = basicTtl == null ? Duration.ofDays(7) : basicTtl;
        }

        public Duration getExpandedTtl() {
            return expandedTtl;
        }

        public void setExpandedTtl(Duration expandedTtl) {
            this.expandedTtl = expandedTtl == null ? Duration.ofDays(1) : expandedTtl;
        }
    }

    /** Cache TTLs for non-details Google Maps requests proxied through the backend. */
    public static class GoogleMapsCache {
        private Duration searchTtl = Duration.ofMinutes(15);
        private Duration geocodeTtl = Duration.ofDays(30);
        private Duration routeTtl = Duration.ofHours(1);
        private Duration photoTtl = Duration.ofDays(1);

        public Duration getSearchTtl() {
            return searchTtl;
        }

        public void setSearchTtl(Duration searchTtl) {
            this.searchTtl = searchTtl == null ? Duration.ofMinutes(15) : searchTtl;
        }

        public Duration getGeocodeTtl() {
            return geocodeTtl;
        }

        public void setGeocodeTtl(Duration geocodeTtl) {
            this.geocodeTtl = geocodeTtl == null ? Duration.ofDays(30) : geocodeTtl;
        }

        public Duration getRouteTtl() {
            return routeTtl;
        }

        public void setRouteTtl(Duration routeTtl) {
            this.routeTtl = routeTtl == null ? Duration.ofHours(1) : routeTtl;
        }

        public Duration getPhotoTtl() {
            return photoTtl;
        }

        public void setPhotoTtl(Duration photoTtl) {
            this.photoTtl = photoTtl == null ? Duration.ofDays(1) : photoTtl;
        }
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
