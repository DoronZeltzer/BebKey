-- Migration: Open House support
-- Run once in the Supabase SQL Editor (idempotent thanks to IF NOT EXISTS).

-- Column: timestamp (with tz) of the next scheduled open-house event.
-- NULL means "no open house scheduled" (the default for all listings).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS open_house_at TIMESTAMPTZ;

-- Optional human-readable line ("Sunday at 10am-12pm", in the listing's
-- original language).  Set when we parse the date from description text,
-- so the UI can show the original phrasing when present.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS open_house_note TEXT;

-- Index speeds up the /open-houses query: listings WITH a future event,
-- ordered by date.  Partial index — small + cheap.
CREATE INDEX IF NOT EXISTS idx_listings_open_house
  ON listings (open_house_at)
  WHERE open_house_at IS NOT NULL AND is_active = true;
