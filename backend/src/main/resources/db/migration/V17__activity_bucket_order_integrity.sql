-- Normalize legacy positions deterministically before enforcing one position per bucket.
-- NULL day_date values form the shared Ideas bucket for each trip.
WITH normalized AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY trip_id, day_date
               ORDER BY order_index, id
           ) - 1 AS normalized_order_index
    FROM activities
)
UPDATE activities AS activity
SET order_index = normalized.normalized_order_index
FROM normalized
WHERE activity.id = normalized.id
  AND activity.order_index IS DISTINCT FROM normalized.normalized_order_index;

CREATE UNIQUE INDEX activities_scheduled_bucket_order_uidx
    ON activities (trip_id, day_date, order_index)
    WHERE day_date IS NOT NULL;

CREATE UNIQUE INDEX activities_ideas_bucket_order_uidx
    ON activities (trip_id, order_index)
    WHERE day_date IS NULL;
