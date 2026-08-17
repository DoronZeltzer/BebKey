-- Migration: add deal_type, lat, lng columns to listings
-- Run in Supabase SQL Editor

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS deal_type text,
  ADD COLUMN IF NOT EXISTS lat       double precision,
  ADD COLUMN IF NOT EXISTS lng       double precision;

-- Backfill deal_type for existing listings using price heuristic
-- (Israeli rent prices are almost always < ₪50,000/month)
UPDATE listings
   SET deal_type = CASE WHEN price < 50000 THEN 'rent' ELSE 'forsale' END
 WHERE deal_type IS NULL AND price IS NOT NULL;

-- Index for deal_type filter
CREATE INDEX IF NOT EXISTS listings_deal_type_idx ON listings (deal_type);

-- Index for geo queries (future use)
CREATE INDEX IF NOT EXISTS listings_lat_lng_idx ON listings (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
