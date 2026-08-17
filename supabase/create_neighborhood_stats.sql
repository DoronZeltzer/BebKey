-- ============================================================
-- BebKey - Create neighborhood_stats materialized view
-- Run in Supabase SQL Editor (postgres / service_role)
--
-- This view is queried by:
--   CityLanding.tsx       → .eq('city', cityName) for price stats
--   NeighborhoodInsights  → .select('*').order('listing_count') for table
--   refresh_neighborhood_stats.py → REFRESH MATERIALIZED VIEW (post-scrape)
--
-- Refreshed automatically at the end of every scraper run.
-- ============================================================

-- ── 1. Create the view ────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.neighborhood_stats AS
SELECT
    city,
    deal_type,
    COUNT(*)::int                                             AS listing_count,
    ROUND(AVG(price))::bigint                                AS avg_price,
    ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
    )::bigint                                                AS median_price,
    ROUND(
        AVG(
            CASE WHEN size_m2 > 0
                 THEN price::numeric / size_m2
                 ELSE NULL
            END
        )
    )::bigint                                                AS avg_price_per_m2,
    ROUND(AVG(rooms)::numeric, 1)::numeric                   AS avg_rooms,
    ROUND(AVG(size_m2)::numeric, 1)::numeric                 AS avg_size_m2,
    MAX(scraped_at)                                          AS last_listing_at
FROM public.listings
WHERE
    is_active  = true
    AND city       IS NOT NULL
    AND deal_type  IS NOT NULL
    AND price      IS NOT NULL
    AND price      BETWEEN 100 AND 50000000
GROUP BY
    city,
    deal_type
WITH DATA;

-- ── 2. Unique index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY) ─────
CREATE UNIQUE INDEX IF NOT EXISTS idx_neighborhood_stats_pk
    ON public.neighborhood_stats (city, deal_type);

-- ── 3. Index for city-based point lookups (CityLanding.tsx) ──────────────────
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_city
    ON public.neighborhood_stats (city);

-- ── 4. Grants - PostgREST/Supabase anon+authenticated must be able to SELECT ─
GRANT SELECT ON public.neighborhood_stats TO anon, authenticated, service_role;

-- ── 5. Verify the view populated ─────────────────────────────────────────────
SELECT
    deal_type,
    COUNT(DISTINCT city) AS cities,
    SUM(listing_count)   AS total_listings,
    ROUND(AVG(avg_price)) AS overall_avg_price
FROM public.neighborhood_stats
GROUP BY deal_type;
