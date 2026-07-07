FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace

COPY . .
RUN chmod +x ./gradlew && ./gradlew --no-daemon clean bootJar

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=build /workspace/build/libs/backend-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 10000

CMD ["sh", "-c", "java ${JAVA_OPTS:-} -Dserver.port=${PORT:-10000} -jar app.jar"]
