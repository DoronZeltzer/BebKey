-- The no-filter grid also offers Price ↓ / Price ↑ / Size ↓ sorts. Those share
-- the same ranking prefix (is_featured, bump_until, quality_score, has_image)
-- but a different final key, so idx_listings_active_rank_newest didn't cover
-- them and they still hit the statement timeout (57014). One partial index per
-- sort so LIMIT can stop early from the index.

CREATE INDEX IF NOT EXISTS idx_listings_active_rank_price_desc
ON public.listings (
  is_featured   DESC NULLS LAST,
  bump_until    DESC NULLS LAST,
  quality_score DESC NULLS LAST,
  has_image     DESC NULLS LAST,
  price         DESC NULLS LAST
)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_listings_active_rank_price_asc
ON public.listings (
  is_featured   DESC NULLS LAST,
  bump_until    DESC NULLS LAST,
  quality_score DESC NULLS LAST,
  has_image     DESC NULLS LAST,
  price         ASC  NULLS LAST
)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_listings_active_rank_size_desc
ON public.listings (
  is_featured   DESC NULLS LAST,
  bump_until    DESC NULLS LAST,
  quality_score DESC NULLS LAST,
  has_image     DESC NULLS LAST,
  size_m2       DESC NULLS LAST
)
WHERE is_active = true;
