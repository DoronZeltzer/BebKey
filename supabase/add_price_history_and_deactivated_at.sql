-- BebKey - Price history tracking + deactivated_at + performance indexes
--
-- Run this once in the Supabase SQL Editor.  All statements are idempotent
-- (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX
-- IF NOT EXISTS) so it's safe to re-run.

-- ── 1.  price_history table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_history (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  old_price    BIGINT,
  new_price    BIGINT NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_history_listing_id_idx
  ON public.price_history (listing_id, changed_at DESC);

-- public read; only service role inserts
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_history_public_read ON public.price_history;
CREATE POLICY price_history_public_read
  ON public.price_history FOR SELECT
  USING (true);

-- ── 2.  deactivated_at column on listings ────────────────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Backfill existing inactive rows so they're not eligible for immediate
-- hard-delete just because their old scraped_at is in the past.
UPDATE public.listings
   SET deactivated_at = COALESCE(deactivated_at, NOW())
 WHERE is_active = FALSE
   AND deactivated_at IS NULL;

-- ── 3.  Trigger: auto-set deactivated_at when is_active flips false ──────────
CREATE OR REPLACE FUNCTION public.set_deactivated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = FALSE AND (OLD.is_active = TRUE OR OLD.is_active IS NULL) THEN
    NEW.deactivated_at = NOW();
  ELSIF NEW.is_active = TRUE AND OLD.is_active = FALSE THEN
    -- reactivated - clear the flag so it isn't accidentally hard-deleted later
    NEW.deactivated_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_deactivated_at ON public.listings;
CREATE TRIGGER trg_set_deactivated_at
  BEFORE UPDATE OF is_active ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_deactivated_at();

-- ── 4.  previous_price + trigger to record price changes ────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS previous_price BIGINT;

CREATE OR REPLACE FUNCTION public.record_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price
     AND NEW.price IS NOT NULL
     AND OLD.price IS NOT NULL
     AND NEW.price <> OLD.price THEN
    INSERT INTO public.price_history (listing_id, old_price, new_price)
      VALUES (NEW.id, OLD.price, NEW.price);
    -- Persist the most recent prior price for cheap card-level "price drop"
    -- badges without joining price_history.
    NEW.previous_price := OLD.price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_price_change ON public.listings;
CREATE TRIGGER trg_record_price_change
  BEFORE UPDATE OF price ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.record_price_change();

-- ── 5.  Performance indexes commonly missing in production ───────────────────
-- These indexes back the common Search / Admin / Dashboard query patterns.
CREATE INDEX IF NOT EXISTS listings_active_city_idx
  ON public.listings (is_active, city) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_active_dealtype_idx
  ON public.listings (is_active, deal_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_active_price_idx
  ON public.listings (is_active, price) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_active_rooms_idx
  ON public.listings (is_active, rooms) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_active_created_at_idx
  ON public.listings (is_active, created_at DESC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_active_quality_idx
  ON public.listings (is_active, quality_score DESC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS listings_source_url_idx
  ON public.listings (source, source_url);

CREATE INDEX IF NOT EXISTS listings_deactivated_at_idx
  ON public.listings (deactivated_at)
  WHERE is_active = false;

-- ── 6.  RPC: get_price_history_for_listing ───────────────────────────────────
-- Used by the listing-detail page to draw the price-history chart.
CREATE OR REPLACE FUNCTION public.get_price_history(p_listing_id UUID)
RETURNS TABLE (
  changed_at TIMESTAMPTZ,
  old_price  BIGINT,
  new_price  BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT changed_at, old_price, new_price
    FROM public.price_history
   WHERE listing_id = p_listing_id
   ORDER BY changed_at ASC;
$$;

-- ── 7.  Materialised view: neighborhood_stats ────────────────────────────────
-- Aggregated stats per city + deal_type for the Neighborhood Insights page.
-- Refresh nightly via the scraper workflow.
DROP MATERIALIZED VIEW IF EXISTS public.neighborhood_stats;
CREATE MATERIALIZED VIEW public.neighborhood_stats AS
SELECT
  city,
  deal_type,
  COUNT(*) AS listing_count,
  ROUND(AVG(price)::numeric, 0) AS avg_price,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) AS median_price,
  ROUND(AVG(CASE WHEN size_m2 > 0 THEN price::numeric / size_m2 END), 0) AS avg_price_per_m2,
  ROUND(AVG(rooms)::numeric, 1) AS avg_rooms,
  ROUND(AVG(size_m2)::numeric, 0) AS avg_size_m2,
  MAX(created_at) AS last_listing_at
FROM public.listings
WHERE is_active = TRUE
  AND price IS NOT NULL
  AND city IS NOT NULL
GROUP BY city, deal_type;

CREATE UNIQUE INDEX IF NOT EXISTS neighborhood_stats_city_deal_idx
  ON public.neighborhood_stats (city, deal_type);

GRANT SELECT ON public.neighborhood_stats TO anon, authenticated;
