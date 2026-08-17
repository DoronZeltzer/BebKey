-- ============================================================
-- BebKey - auto-compute has_image + quality_score
-- Safe to run even if columns already exist.
-- Run in Supabase SQL Editor (postgres / service_role)
-- ============================================================

-- 1. Drop existing columns (they might be regular columns with no auto-compute).
--    GENERATED ALWAYS columns will be recreated correctly from live data.
ALTER TABLE listings DROP COLUMN IF EXISTS has_image;
ALTER TABLE listings DROP COLUMN IF EXISTS quality_score;

-- 2. Re-add as GENERATED ALWAYS STORED - Postgres computes them automatically
--    on every INSERT and UPDATE. No trigger needed, always consistent.
ALTER TABLE listings
  ADD COLUMN has_image boolean GENERATED ALWAYS AS (
      array_length(images, 1) > 0
  ) STORED;

ALTER TABLE listings
  ADD COLUMN quality_score integer GENERATED ALWAYS AS (
      -- Images bucket (0-5 pts):
      CASE
        WHEN array_length(images, 1) >= 5 THEN 5
        WHEN array_length(images, 1) >= 3 THEN 4
        WHEN array_length(images, 1) >= 1 THEN 3
        ELSE 0
      END
      -- Data completeness (+1 each for up to 5 bonus pts):
      + CASE WHEN price       IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN rooms       IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN size_m2     IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN city        IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN description IS NOT NULL
              AND char_length(description) > 50 THEN 1 ELSE 0 END
      -- Max possible: 5 + 5 = 10
  ) STORED;

-- 3. Partial index optimised for the home-page featured query
--    (is_active=true AND has_image=true ORDER BY quality_score DESC)
DROP INDEX IF EXISTS idx_listings_quality;
CREATE INDEX idx_listings_quality
  ON listings (quality_score DESC, id DESC)
  WHERE is_active = true AND has_image = true;

-- 4. Verify - show quality distribution across all listings
SELECT
  has_image,
  quality_score,
  count(*) AS n
FROM listings
GROUP BY has_image, quality_score
ORDER BY has_image DESC NULLS LAST, quality_score DESC NULLS LAST
LIMIT 30;
