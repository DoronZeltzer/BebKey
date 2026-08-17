-- ============================================================
-- BebKey - update quality_score weighting
-- Run in Supabase SQL Editor (postgres / service_role)
--
-- Previous formula: +1 each for price / rooms / size_m2 / city / description>50
-- New formula: price=2pts, city=1pt, rooms=1pt, (size_m2 OR desc>50)=1pt
--
-- Rationale: a listing missing a price is far less useful than one missing
-- a description; this ensures high-value listings surface first.
-- ============================================================

-- 1. Drop existing generated columns (they must be dropped to change the formula)
ALTER TABLE listings DROP COLUMN IF EXISTS has_image;
ALTER TABLE listings DROP COLUMN IF EXISTS quality_score;

-- 2. Re-add with updated weights
ALTER TABLE listings
  ADD COLUMN has_image boolean GENERATED ALWAYS AS (
      array_length(images, 1) > 0
  ) STORED;

ALTER TABLE listings
  ADD COLUMN quality_score integer GENERATED ALWAYS AS (
      -- Images bucket (0-5 pts)
      CASE
        WHEN array_length(images, 1) >= 5 THEN 5
        WHEN array_length(images, 1) >= 3 THEN 4
        WHEN array_length(images, 1) >= 1 THEN 3
        ELSE 0
      END
      -- Completeness (0-5 pts) - weighted by criticality
      + CASE WHEN price IS NOT NULL THEN 2 ELSE 0 END   -- most critical
      + CASE WHEN city  IS NOT NULL THEN 1 ELSE 0 END   -- location essential
      + CASE WHEN rooms IS NOT NULL THEN 1 ELSE 0 END   -- bedroom filter
      + CASE                                             -- at least one detail
          WHEN size_m2 IS NOT NULL
            OR (description IS NOT NULL AND char_length(description) > 50)
          THEN 1 ELSE 0
        END
      -- Max possible: 5 + 2 + 1 + 1 + 1 = 10
  ) STORED;

-- 3. Rebuild the partial index (quality DESC for featured listings)
DROP INDEX IF EXISTS idx_listings_quality;
CREATE INDEX idx_listings_quality
  ON listings (quality_score DESC, id DESC)
  WHERE is_active = true AND has_image = true;

-- 4. Verify distribution
SELECT
  quality_score,
  count(*) AS n,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS pct
FROM listings
WHERE is_active = true
GROUP BY quality_score
ORDER BY quality_score DESC;
