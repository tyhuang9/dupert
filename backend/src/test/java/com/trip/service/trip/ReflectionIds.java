package com.trip.service.trip;

import java.lang.reflect.Field;

/**
 * Test-only helper for setting JPA-managed primary keys on entities whose getters are
 * public but whose {@code id} setters intentionally don't exist (production code should
 * never assign these — only Hibernate via reflection does). Mirrors what the persistence
 * layer would do, without spinning up a Spring context for unit tests.
 */
final class ReflectionIds {

    private ReflectionIds() {
    }

    static void setId(Object entity, Long id) {
        try {
            Field f = entity.getClass().getDeclaredField("id");
            f.setAccessible(true);
            f.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set id via reflection", e);
        }
    }
}
