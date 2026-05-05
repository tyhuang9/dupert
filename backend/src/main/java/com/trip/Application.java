package com.trip;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.trip.config.AppProperties;
import com.trip.config.SecureProperties;

@SpringBootApplication
@ConfigurationPropertiesScan(basePackageClasses = { AppProperties.class, SecureProperties.class })
@EnableScheduling
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
