package com.trip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link PasswordPolicyValidator}. Pure logic — no Spring context.
 *
 * <p>Length is owned by {@code @Size}, so we don't assert min-length here. We also let
 * null/blank pass so the policy validator doesn't double-report what {@code @NotBlank}
 * already covers.
 */
class PasswordPolicyValidatorTest {

    private final PasswordPolicyValidator validator = new PasswordPolicyValidator();

    @Test
    void letterPlusDigitPasses() {
        assertThat(validator.isValid("password1234", null)).isTrue();
        assertThat(validator.isValid("a1", null)).isTrue();
        assertThat(validator.isValid("Sup3rSecret!", null)).isTrue();
    }

    @Test
    void onlyLettersFails() {
        assertThat(validator.isValid("alllettersnodigits", null)).isFalse();
    }

    @Test
    void onlyDigitsFails() {
        assertThat(validator.isValid("123456789012", null)).isFalse();
    }

    @Test
    void onlySymbolsFails() {
        assertThat(validator.isValid("!@#$%^&*()_+", null)).isFalse();
    }

    @Test
    void unicodeLetterCountsAsLetter() {
        // Character.isLetter handles non-ASCII letters — "passwörd2" is letter+digit.
        assertThat(validator.isValid("passwörd2", null)).isTrue();
    }

    @Test
    void nullAndBlankPassThrough() {
        assertThat(validator.isValid(null, null)).isTrue();
        assertThat(validator.isValid("", null)).isTrue();
    }
}
