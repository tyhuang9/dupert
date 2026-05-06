package com.trip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.PropertySource;
import org.springframework.mock.env.MockEnvironment;

/**
 * Unit tests for the dotenv-loading concern of {@link BootEnvironmentProcessor}. The processor
 * reads <code>${user.dir}/.env</code> first, then <code>${user.dir}/../.env</code>; we drive that
 * by pointing <code>user.dir</code> at JUnit's {@link TempDir} per test and restoring it after.
 */
class BootEnvironmentProcessorDotenvTest {

    private String originalUserDir;
    private final BootEnvironmentProcessor processor = new BootEnvironmentProcessor();

    @BeforeEach
    void captureUserDir() {
        originalUserDir = System.getProperty("user.dir");
    }

    @AfterEach
    void restoreUserDir() {
        if (originalUserDir != null) {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    private static void writeEnv(Path dir, String... lines) throws Exception {
        Files.write(dir.resolve(".env"), List.of(lines));
    }

    @Test
    void loadsSimpleKeyValuePairs(@TempDir Path tmp) throws Exception {
        writeEnv(tmp, "FOO=bar", "BAZ=qux");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("FOO")).isEqualTo("bar");
        assertThat(env.getProperty("BAZ")).isEqualTo("qux");
    }

    @Test
    void skipsBlankAndCommentLines(@TempDir Path tmp) throws Exception {
        writeEnv(tmp,
                "",
                "# this is a comment",
                "   # indented comment",
                "FOO=bar",
                "",
                "BAZ=qux");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("FOO")).isEqualTo("bar");
        assertThat(env.getProperty("BAZ")).isEqualTo("qux");
    }

    @Test
    void singleQuotesAreLiteralWithNoEscapeProcessing(@TempDir Path tmp) throws Exception {
        // The whole point — shell metachars and a literal backslash-n must survive.
        writeEnv(tmp, "WEIRD='a&b;c$d'", "BACKSLASH='line\\n'");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("WEIRD")).isEqualTo("a&b;c$d");
        assertThat(env.getProperty("BACKSLASH")).isEqualTo("line\\n");
    }

    @Test
    void doubleQuotesProcessBasicEscapes(@TempDir Path tmp) throws Exception {
        writeEnv(tmp,
                "NEWLINE=\"a\\nb\"",
                "TAB=\"a\\tb\"",
                "RETURN=\"a\\rb\"",
                "BACKSLASH=\"a\\\\b\"",
                "QUOTE=\"a\\\"b\"");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("NEWLINE")).isEqualTo("a\nb");
        assertThat(env.getProperty("TAB")).isEqualTo("a\tb");
        assertThat(env.getProperty("RETURN")).isEqualTo("a\rb");
        assertThat(env.getProperty("BACKSLASH")).isEqualTo("a\\b");
        assertThat(env.getProperty("QUOTE")).isEqualTo("a\"b");
    }

    @Test
    void doesNotOverrideAlreadySetProperty(@TempDir Path tmp) throws Exception {
        writeEnv(tmp, "JWT_SECRET=from-dotenv");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment().withProperty("JWT_SECRET", "already-set");

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("JWT_SECRET")).isEqualTo("already-set");
    }

    @Test
    void noOpWhenNoDotenvExists(@TempDir Path tmp) throws Exception {
        // tmp has no .env, and tmp/.. (the system temp root) almost certainly doesn't either —
        // but to be defensive we work inside a nested empty dir whose parent is also empty.
        Path inner = Files.createDirectory(tmp.resolve("inner"));
        System.setProperty("user.dir", inner.toString());
        MockEnvironment env = new MockEnvironment();
        int sourceCountBefore = env.getPropertySources().size();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getPropertySources().size()).isEqualTo(sourceCountBefore);
    }

    @Test
    void skipsEntirelyWhenProdProfileActive(@TempDir Path tmp) throws Exception {
        writeEnv(tmp, "FOO=bar");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("FOO")).isNull();
        assertThat(env.getPropertySources().contains("dotenvFile")).isFalse();
    }

    @Test
    void skipsMalformedLinesWithoutEqualsSign(@TempDir Path tmp) throws Exception {
        writeEnv(tmp,
                "this line has no equals",
                "=value-with-no-key",
                "FOO=bar");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        assertThat(env.getProperty("FOO")).isEqualTo("bar");
    }

    @Test
    void addedPropertySourceIsLowestPriority(@TempDir Path tmp) throws Exception {
        writeEnv(tmp, "FOO=bar");
        System.setProperty("user.dir", tmp.toString());
        MockEnvironment env = new MockEnvironment();

        processor.postProcessEnvironment(env, null);

        List<PropertySource<?>> sources = env.getPropertySources().stream().toList();
        assertThat(sources.get(sources.size() - 1).getName()).isEqualTo("dotenvFile");
    }
}
