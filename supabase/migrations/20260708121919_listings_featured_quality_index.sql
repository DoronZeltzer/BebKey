-- The Home page "featured" sections (order by quality_score DESC, id DESC over
-- active listings with a photo, LIMIT 6) were also hitting the statement
-- timeout (57014) — no index for that sort, so a full scan + sort of the whole
-- table. This partial index lets Postgres pull the top rows straight from the
-- index and stop at LIMIT 6. deal_type (rent/forsale variants) is filtered
-- inline, which is cheap since the index is already in quality order.
CREATE INDEX IF NOT EXISTS idx_listings_featured_quality
ON public.listings (quality_score DESC NULLS LAST, id DESC)
WHERE is_active = true AND has_image = true;
