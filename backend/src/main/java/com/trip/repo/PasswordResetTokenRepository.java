package com.trip.repo;

import java.time.OffsetDateTime;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.PasswordResetToken;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT prt FROM PasswordResetToken prt WHERE prt.tokenHash = :tokenHash")
    Optional<PasswordResetToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("UPDATE PasswordResetToken prt SET prt.revokedAt = :now "
        + "WHERE prt.userId = :userId AND prt.consumedAt IS NULL AND prt.revokedAt IS NULL")
    int revokeActiveForUser(@Param("userId") Long userId, @Param("now") OffsetDateTime now);
}
