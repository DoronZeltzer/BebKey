-- get_distinct_cities()
-- Returns a sorted array of all distinct, non-null city names from active listings.
-- Used by the Search page city dropdown - avoids the 1000-row PostgREST limit
-- that would otherwise miss cities only represented in later rows.

-- Uses a "loose index scan" (recursive skip-scan over idx_listings_active_city)
-- instead of SELECT DISTINCT, which had to read all ~75k active rows and timed
-- out (57014). This seeks one index entry per distinct city (~hundreds) → fast.
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

-- Grant execute to anon + authenticated roles so the frontend can call it
GRANT EXECUTE ON FUNCTION public.get_distinct_cities() TO anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_cities() TO authenticated;
