-- V2: share_links.created_by ON DELETE SET NULL was incompatible with the column's
-- NOT NULL constraint. Switch to CASCADE so a deleted user's share links go away too.
ALTER TABLE share_links
    DROP CONSTRAINT IF EXISTS share_links_created_by_fkey,
    ADD CONSTRAINT share_links_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
