package com.trip.web.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Unit tests for {@link RefreshCookie}. Verifies the {@code Set-Cookie} header includes
 * every expected attribute, including SameSite (which the legacy
 * {@code Cookie} API can't emit). Uses Spring's {@code MockHttpServletResponse}.
 */
class RefreshCookieTest {

    @Test
    void addsCookieWithAllExpectedAttributes() {
        RefreshCookie cookie = new RefreshCookie(true);
        MockHttpServletResponse resp = new MockHttpServletResponse();

        cookie.addToResponse(resp, "raw-token-value");

        String header = resp.getHeader("Set-Cookie");
        assertThat(header).isNotNull();
        assertThat(header).startsWith("refresh_token=raw-token-value");
        assertThat(header).contains("HttpOnly");
        assertThat(header).contains("Secure");
        assertThat(header).contains("SameSite=Strict");
        assertThat(header).contains("Path=/api/auth");
        assertThat(header).contains("Max-Age=2592000");
    }

    @Test
    void omitsSecureWhenAppPropertyIsFalse() {
        RefreshCookie cookie = new RefreshCookie(false);
        MockHttpServletResponse resp = new MockHttpServletResponse();

        cookie.addToResponse(resp, "raw-token-value");

        String header = resp.getHeader("Set-Cookie");
        assertThat(header).isNotNull();
        assertThat(header).doesNotContain("Secure");
        assertThat(header).contains("HttpOnly");
        assertThat(header).contains("SameSite=Strict");
    }

    @Test
    void supportsSameSiteNoneForSplitOriginDeployments() {
        RefreshCookie cookie = new RefreshCookie(true, "None");
        MockHttpServletResponse resp = new MockHttpServletResponse();

        cookie.addToResponse(resp, "raw-token-value");

        String header = resp.getHeader("Set-Cookie");
        assertThat(header).isNotNull();
        assertThat(header).contains("Secure");
        assertThat(header).contains("SameSite=None");
    }

    @Test
    void clearOnResponseSetsMaxAgeZero() {
        RefreshCookie cookie = new RefreshCookie(true);
        MockHttpServletResponse resp = new MockHttpServletResponse();

        cookie.clearOnResponse(resp);

        String header = resp.getHeader("Set-Cookie");
        assertThat(header).isNotNull();
        assertThat(header).startsWith("refresh_token=");
        assertThat(header).contains("Max-Age=0");
        assertThat(header).contains("Path=/api/auth");
    }
}
