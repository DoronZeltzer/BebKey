-- Fix: get_distinct_cities() (powers the Search city dropdown) was also hitting
-- the statement timeout — it does SELECT DISTINCT city ... ORDER BY city over
-- the whole ~75k-row table with no index on city, forcing a full scan + sort.
-- This partial index lets Postgres do an index-only scan of the city column
-- (already ordered), so DISTINCT just collapses adjacent duplicates — fast.
CREATE INDEX IF NOT EXISTS idx_listings_active_city
ON public.listings (city)
WHERE is_active = true AND city IS NOT NULL;
