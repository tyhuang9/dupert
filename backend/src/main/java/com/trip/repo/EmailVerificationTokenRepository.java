package com.trip.repo;

import java.time.OffsetDateTime;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.EmailVerificationToken;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT evt FROM EmailVerificationToken evt WHERE evt.tokenHash = :tokenHash")
    Optional<EmailVerificationToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    Optional<EmailVerificationToken> findTopByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndCreatedAtAfter(Long userId, OffsetDateTime after);

    @Modifying
    @Query("UPDATE EmailVerificationToken evt SET evt.revokedAt = :now "
        + "WHERE evt.userId = :userId AND evt.consumedAt IS NULL AND evt.revokedAt IS NULL")
    int revokeActiveForUser(@Param("userId") Long userId, @Param("now") OffsetDateTime now);

    @Modifying
    @Query("""
        DELETE FROM EmailVerificationToken evt
        WHERE evt.expiresAt < :cutoff
           OR evt.consumedAt < :cutoff
           OR evt.revokedAt < :cutoff
        """)
    int deleteInactiveBefore(@Param("cutoff") OffsetDateTime cutoff);
}
