-- Fix: the no-filter "all listings" grid was hitting Supabase's statement
-- timeout (error 57014). That query is:
--   WHERE is_active AND (price bounds)
--   ORDER BY is_featured DESC, bump_until DESC, quality_score DESC,
--            has_image DESC, created_at DESC   -- (all NULLS LAST)
--   LIMIT 12
-- With no filter it full-scanned + sorted the whole ~58k-row table. This
-- partial index matches that exact sort so Postgres walks the top rows
-- straight from the index (LIMIT stops early) instead of sorting everything.
-- It covers the default "newest" sort — the one hit when loading all listings.
CREATE INDEX IF NOT EXISTS idx_listings_active_rank_newest
ON public.listings (
  is_featured   DESC NULLS LAST,
  bump_until    DESC NULLS LAST,
  quality_score DESC NULLS LAST,
  has_image     DESC NULLS LAST,
  created_at    DESC NULLS LAST
)
WHERE is_active = true;

-- Refresh planner stats so the new index + estimated counts plan well.
ANALYZE public.listings;
