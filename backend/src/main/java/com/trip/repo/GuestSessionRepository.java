package com.trip.repo;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.GuestSession;

/**
 * Spring Data repository for {@link GuestSession}.
 *
 * <p>Guest sessions are created when an anonymous visitor accepts a share link
 * and provides a display name. Each session is bound to a {@code share_link_id}.
 */
public interface GuestSessionRepository extends JpaRepository<GuestSession, Long> {

    /**
     * Find a guest session by its id.
     */
    Optional<GuestSession> findById(Long id);
}
