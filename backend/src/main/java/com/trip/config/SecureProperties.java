package com.trip.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Feature flags for security headers that should only fire in certain environments.
 */
@ConfigurationProperties(prefix = "secure")
public class SecureProperties {

    private Hsts hsts = new Hsts();

    public Hsts getHsts() {
        return hsts;
    }

    public void setHsts(Hsts hsts) {
        this.hsts = hsts == null ? new Hsts() : hsts;
    }

    public static class Hsts {
        /** When true, the {@code Strict-Transport-Security} header is emitted. */
        private boolean enabled = false;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }
}
