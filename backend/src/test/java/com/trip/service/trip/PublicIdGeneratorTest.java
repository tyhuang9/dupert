package com.trip.service.trip;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Random;
import java.util.Set;

import org.junit.jupiter.api.Test;

class PublicIdGeneratorTest {

    @Test
    void generatesIdOfExpectedLength() {
        PublicIdGenerator gen = new PublicIdGenerator();
        for (int i = 0; i < 50; i++) {
            assertThat(gen.generate()).hasSize(PublicIdGenerator.LENGTH);
        }
    }

    @Test
    void onlyUsesAllowedAlphabet() {
        PublicIdGenerator gen = new PublicIdGenerator();
        Set<Character> allowed = new HashSet<>();
        for (char c : PublicIdGenerator.ALPHABET.toCharArray()) {
            allowed.add(c);
        }
        for (int i = 0; i < 1000; i++) {
            for (char c : gen.generate().toCharArray()) {
                assertThat(allowed).contains(c);
            }
        }
    }

    @Test
    void neverContainsAmbiguousCharacters() {
        // Tighter assertion than the alphabet membership check above: even if someone
        // bumps ALPHABET in a refactor, these specific chars must stay out.
        PublicIdGenerator gen = new PublicIdGenerator();
        for (int i = 0; i < 1000; i++) {
            String id = gen.generate();
            assertThat(id).doesNotContain("0", "1", "i", "l", "o");
        }
    }

    @Test
    void thousandIdsAreUnique() {
        PublicIdGenerator gen = new PublicIdGenerator();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            seen.add(gen.generate());
        }
        // Birthday collisions at 1000 draws from a 31^12 space are vanishingly unlikely;
        // any duplicate here would indicate a broken RNG path.
        assertThat(seen).hasSize(1000);
    }

    @Test
    void deterministicSeedProducesDeterministicOutput() {
        // Test seam: same seed -> same sequence. Guards against a future refactor that
        // might (e.g.) cache state per generate() call in a way that breaks reproducibility.
        PublicIdGenerator a = new PublicIdGenerator(new Random(12345L));
        PublicIdGenerator b = new PublicIdGenerator(new Random(12345L));
        for (int i = 0; i < 20; i++) {
            assertThat(a.generate()).isEqualTo(b.generate());
        }
    }

    @Test
    void differentSeedsProduceDifferentOutput() {
        PublicIdGenerator a = new PublicIdGenerator(new Random(1L));
        PublicIdGenerator b = new PublicIdGenerator(new Random(2L));
        assertThat(a.generate()).isNotEqualTo(b.generate());
    }
}
