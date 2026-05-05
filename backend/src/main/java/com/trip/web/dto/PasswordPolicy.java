package com.trip.web.dto;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Validates that a password contains at least one letter and at least one digit.
 *
 * <p>Length is enforced separately via {@code @Size}; this annotation only handles the
 * character-class requirement called out in PROJECT.md §5 (NIST-style policy).
 *
 * <p>The error message is intentionally short and non-revealing — it says <em>what</em>
 * is missing in policy terms, never echoes the password back.
 */
@Documented
@Constraint(validatedBy = PasswordPolicyValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER })
@Retention(RetentionPolicy.RUNTIME)
public @interface PasswordPolicy {

    String message() default "must contain at least one letter and one digit";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
