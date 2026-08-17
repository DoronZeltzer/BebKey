-- ============================================================
-- Fixes for bugs reported by beta testers (2026-05-11)
-- Run this once in Supabase SQL Editor
-- ============================================================

-- ── 1. Add total_floors column if missing ──────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS total_floors integer;

-- ── 2. Remove duplicate listings (keep the one with lowest id = first inserted) ─
-- Deduplicates by source_url, keeping the earliest record for each.
DELETE FROM listings
WHERE id NOT IN (
  SELECT MIN(id)
  FROM   listings
  WHERE  source_url IS NOT NULL
  GROUP  BY source_url
)
AND source_url IS NOT NULL;

-- ── 3. Mark price > 50M as inactive (don't delete, just hide) ─────────────────
UPDATE listings
SET    is_active = false
WHERE  price > 50000000;

-- ── 4. Fix Madlan listings where deal_type is NULL ─────────────────────────────
-- Heuristic: if price < 15000 → rent, else → forsale
-- (The real fix is the updated scraper which now sets deal_type correctly)
UPDATE listings
SET    deal_type = CASE
         WHEN price IS NOT NULL AND price < 15000 THEN 'rent'
         ELSE 'forsale'
       END
WHERE  deal_type IS NULL
AND    source = 'madlan';

-- ── 5. Add UNIQUE constraint on source_url so ON CONFLICT works ───────────────
-- This will fail if there are still duplicates after step 2 - run step 2 first.
ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_source_url_unique;

ALTER TABLE listings
  ADD CONSTRAINT listings_source_url_unique UNIQUE (source_url);

-- ── 6. Index for faster deal_type + is_active queries ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_deal_type
  ON listings (deal_type)
  WHERE is_active = true;

-- Done!
SELECT
  deal_type,
  COUNT(*) AS count
FROM listings
WHERE is_active = true
GROUP BY deal_type
ORDER BY deal_type;
