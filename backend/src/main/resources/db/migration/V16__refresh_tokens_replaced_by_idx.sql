-- Rotation/reuse handling can traverse the replacement chain by replaced_by.
-- PostgreSQL does not create an index automatically for foreign-key columns.
CREATE INDEX refresh_tokens_replaced_by_idx ON refresh_tokens (replaced_by);
