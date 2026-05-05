package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EmailNormalizerTest {

    @Test
    void lowercasesAndTrims() {
        assertThat(EmailNormalizer.normalize("  Foo@Example.COM  ")).isEqualTo("foo@example.com");
    }

    @Test
    void nullInputReturnsNull() {
        assertThat(EmailNormalizer.normalize(null)).isNull();
    }

    @Test
    void emptyStringReturnsEmpty() {
        assertThat(EmailNormalizer.normalize("   ")).isEmpty();
    }

    @Test
    void basicAsciiLowercase() {
        assertThat(EmailNormalizer.normalize("INFO@EXAMPLE.COM")).isEqualTo("info@example.com");
    }

    @Test
    void usesRootLocaleNotTurkish() {
        // Under Locale.TURKEY, "I".toLowerCase() => "ı" (dotless i, U+0131). The Javadoc
        // promises Locale.ROOT; this guards against a future refactor accidentally using
        // the default locale.
        assertThat(EmailNormalizer.normalize("I@X.COM")).isEqualTo("i@x.com");
    }
}
