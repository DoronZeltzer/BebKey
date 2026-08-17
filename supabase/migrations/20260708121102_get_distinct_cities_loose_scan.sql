-- get_distinct_cities() was timing out (57014): plain SELECT DISTINCT city has
-- to read every one of the ~75k active rows (no LIMIT to stop early), and on
-- this heavily-upserted table index-only scans fall back to heap reads.
--
-- Rewrite it as a "loose index scan" (recursive skip-scan): start at the first
-- city, then repeatedly seek the next city greater than the current one via
-- idx_listings_active_city. That's ~one index seek per DISTINCT city (~hundreds)
-- instead of a full 75k-row scan — milliseconds regardless of table bloat.
CREATE OR REPLACE FUNCTION public.get_distinct_cities()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE t AS (
    SELECT (
      SELECT l.city FROM listings l
      WHERE l.is_active = true AND l.city IS NOT NULL
      ORDER BY l.city
      LIMIT 1
    ) AS city
    UNION ALL
    SELECT (
      SELECT l.city FROM listings l
      WHERE l.is_active = true AND l.city IS NOT NULL AND l.city > t.city
      ORDER BY l.city
      LIMIT 1
    )
    FROM t
    WHERE t.city IS NOT NULL
  )
  SELECT COALESCE(array_agg(city ORDER BY city), '{}')
  FROM t
  WHERE city IS NOT NULL;
$$;
