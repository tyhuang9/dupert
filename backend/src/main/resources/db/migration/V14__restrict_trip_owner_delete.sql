ALTER TABLE trips
    DROP CONSTRAINT IF EXISTS trips_owner_id_fkey,
    ADD CONSTRAINT trips_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
