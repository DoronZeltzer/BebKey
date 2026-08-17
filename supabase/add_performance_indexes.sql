-- ============================================================
-- BebKey - performance indexes
-- Run in Supabase SQL Editor (postgres / service_role)
--
-- Targets two hot query patterns:
--
--   1. preload_existing_urls (runs at the start of every scraper):
--      SELECT source_url FROM listings
--      WHERE source = 'winwin' AND is_active = true
--      → composite (source, is_active) with INCLUDE(source_url) turns
--        this into a pure index-only scan - no heap touch at all.
--
--   2. dedup_listings pass 1 & 2 (city/price/rooms bucket queries):
--      Full table scans across (city, price, rooms) for in-memory grouping.
--      As the table grows past ~200k rows the fetch becomes the bottleneck.
--
--   3. deactivate_stale.py (scans active listings by scraped_at):
--      SELECT ... FROM listings WHERE is_active = true ORDER BY scraped_at
--
-- ============================================================

-- ── 1. Covering index for preload_existing_urls ───────────────────────────────
-- Lets "SELECT source_url WHERE source=X AND is_active=true" be satisfied
-- entirely from the index (index-only scan).  ~10× faster as DB grows.
CREATE INDEX IF NOT EXISTS idx_listings_source_active
    ON listings (source, is_active)
    INCLUDE (source_url);

-- ── 2. Composite index for dedup city-price-rooms bucket ─────────────────────
-- Supports both same-source pass (source, city, price, rooms) and
-- cross-source pass (city, price, rooms) without full-table scans.
CREATE INDEX IF NOT EXISTS idx_listings_dedup_key
    ON listings (city, price, rooms)
    WHERE is_active = true;

-- ── 3. Index for stale-detection scan ────────────────────────────────────────
-- deactivate_stale.py and track_price_changes.py filter active listings by age.
CREATE INDEX IF NOT EXISTS idx_listings_active_scraped
    ON listings (is_active, scraped_at DESC)
    WHERE is_active = true;

-- ── 4. Partial index for source_id lookups (Telegram, Yad2) ──────────────────
-- Telegram and Yad2 preload by source_id instead of source_url.
-- The existing unique constraint on source_url doesn't help source_id queries.
CREATE INDEX IF NOT EXISTS idx_listings_source_id
    ON listings (source, source_id)
    WHERE source_id IS NOT NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
    indexrelname AS indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE relname = 'listings'
ORDER BY pg_relation_size(indexrelid) DESC;
