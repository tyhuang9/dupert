ALTER TABLE activities ALTER COLUMN day_date DROP NOT NULL;

CREATE INDEX activities_ideas_order_idx
    ON activities (trip_id, order_index)
    WHERE day_date IS NULL;
