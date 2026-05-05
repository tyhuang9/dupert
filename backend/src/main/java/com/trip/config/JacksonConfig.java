package com.trip.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;

import java.util.List;

/**
 * Jackson hardening:
 * <ul>
 *   <li>No {@code DefaultTyping} — Jackson's history of polymorphic-deserialization RCEs
 *       all trace back to enabling this. We leave it off.</li>
 *   <li>{@code FAIL_ON_UNKNOWN_PROPERTIES} is on — unexpected fields become 400s instead
 *       of silently ignored, which makes mass-assignment mistakes fail loudly.</li>
 *   <li>{@code JavaTimeModule} registered so {@code LocalDate}/{@code LocalTime}/
 *       {@code OffsetDateTime} round-trip as ISO-8601.</li>
 *   <li>Only {@code application/json} is accepted/produced by the REST layer (no XML,
 *       no YAML, no form-urlencoded — removes a whole class of parser-based attacks).</li>
 * </ul>
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> builder
            .modulesToInstall(new JavaTimeModule())
            .failOnUnknownProperties(true)
            .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .featuresToEnable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .serializationInclusion(JsonInclude.Include.NON_NULL);
    }

    /**
     * Replace the auto-configured Jackson converter with one that <em>only</em> advertises
     * {@code application/json} — prevents Spring from trying to (de)serialize XML or
     * other formats by accident.
     */
    @Bean
    public MappingJackson2HttpMessageConverter jsonOnlyConverter(ObjectMapper mapper) {
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter(mapper);
        converter.setSupportedMediaTypes(List.of(MediaType.APPLICATION_JSON));
        return converter;
    }
}
