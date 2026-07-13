-- Share-link URLs are bearer credentials. V6 persisted their raw token solely so
-- existing links could be copied later. Revoke every issued link instead, which
-- cascades to guest_sessions and safely clears guest attribution through its
-- existing ON DELETE SET NULL foreign keys.
--
-- Keep share_links.token nullable for one deployment so rollback to the prior
-- application version remains schema-compatible. A later migration can drop it.
ALTER TABLE share_links
    ALTER COLUMN token DROP NOT NULL;

DELETE FROM share_links;
