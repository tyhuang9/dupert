package com.trip.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;

class SecurityDeploymentValidatorTest {

    @Test
    void localDevelopmentOriginDoesNotRequireTransportHardening() {
        AppProperties app = appProperties("http://localhost:3001", false);
        SecureProperties secure = secureProperties(false);
        SecurityDeploymentValidator validator = new SecurityDeploymentValidator(
            app, secure, new MockEnvironment().withProperty("spring.profiles.active", "dev"));

        assertThat(validator.requiresTransportHardening()).isFalse();
    }

    @Test
    void productionProfileRequiresSecureCookiesAndHsts() {
        AppProperties app = appProperties("", false);
        SecureProperties secure = secureProperties(false);
        SecurityDeploymentValidator validator = new SecurityDeploymentValidator(
            app, secure, new MockEnvironment().withProperty("spring.profiles.active", "prod"));

        assertThat(validator.requiresTransportHardening()).isTrue();
        assertThatThrownBy(() -> validator.run(new DefaultApplicationArguments()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("app.cookies.secure=true")
            .hasMessageContaining("secure.hsts.enabled=true");
    }

    @Test
    void publicFrontendOriginRequiresTransportHardening() {
        AppProperties app = appProperties("https://tripplanner.example", true);
        SecureProperties secure = secureProperties(true);
        SecurityDeploymentValidator validator = new SecurityDeploymentValidator(
            app, secure, new MockEnvironment().withProperty("spring.profiles.active", "staging"));

        assertThat(validator.requiresTransportHardening()).isTrue();
        validator.run(new DefaultApplicationArguments());
    }

    private static AppProperties appProperties(String frontendOrigin, boolean secureCookies) {
        AppProperties app = new AppProperties();
        app.setFrontendOrigin(frontendOrigin);
        app.getCookies().setSecure(secureCookies);
        return app;
    }

    private static SecureProperties secureProperties(boolean hstsEnabled) {
        SecureProperties secure = new SecureProperties();
        secure.getHsts().setEnabled(hstsEnabled);
        return secure;
    }
}
