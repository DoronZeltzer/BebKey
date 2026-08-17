-- Migration: Missing columns and tables for BebKey
-- Run this once in the Supabase SQL Editor.
-- All statements use IF NOT EXISTS so it's safe to run multiple times.

-- ── 1. listings table - add missing columns ───────────────────────────────
-- Coordinates for precise map pin display
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lat        DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lng        DOUBLE PRECISION;

-- Rent vs. for-sale flag used by scrapers and the map/search UI
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deal_type  TEXT CHECK (deal_type IN ('rent', 'forsale'));

-- Unique identifier per source (used by Facebook scraper for deduplication)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_id  TEXT;

-- Short title (Facebook/Madlan listings have a title separate from description)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS title      TEXT;

-- Unique constraint: one row per (source, source_id) for upsert deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_id ON listings (source, source_id) WHERE source_id IS NOT NULL;

-- Index speeds up map queries (fetch only listings that have coordinates)
CREATE INDEX IF NOT EXISTS idx_listings_coords ON listings (lat, lng) WHERE lat IS NOT NULL;

-- Index for deal_type filtering on search page
CREATE INDEX IF NOT EXISTS idx_listings_deal_type ON listings (deal_type);

-- ── 2. saved_listings table - user favourites ─────────────────────────────
-- Referenced by useSavedListings hook and Dashboard "Saved" tab
CREATE TABLE IF NOT EXISTS saved_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id  UUID NOT NULL REFERENCES listings(id)   ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

-- Enable RLS: users can only see and manage their own saved listings
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own saved listings"
  ON saved_listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can save listings"
  ON saved_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can unsave listings"
  ON saved_listings FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookup of a user's saved listings
CREATE INDEX IF NOT EXISTS idx_saved_listings_user ON saved_listings (user_id);

-- ── 3. filters table - add missing columns ───────────────────────────────
ALTER TABLE filters ADD COLUMN IF NOT EXISTS deal_type        TEXT CHECK (deal_type IN ('rent', 'forsale'));
ALTER TABLE filters ADD COLUMN IF NOT EXISTS rooms_max        NUMERIC;
ALTER TABLE filters ADD COLUMN IF NOT EXISTS size_max         NUMERIC;
-- Email address to notify when new listings match this saved search
ALTER TABLE filters ADD COLUMN IF NOT EXISTS notify_email     TEXT;
-- Timestamp of last alert email sent (prevents duplicate alerts)
ALTER TABLE filters ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- ── 4. notifications table - track which ones have been emailed ───────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- ── 5. reported_listings table - user abuse reports ──────────────────────
CREATE TABLE IF NOT EXISTS reported_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reported_listings ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a report
CREATE POLICY IF NOT EXISTS "Anyone can report a listing"
  ON reported_listings FOR INSERT
  WITH CHECK (true);

-- Only service role / admin can read reports (no SELECT policy for users)
CREATE INDEX IF NOT EXISTS idx_reported_listings_listing ON reported_listings (listing_id);
