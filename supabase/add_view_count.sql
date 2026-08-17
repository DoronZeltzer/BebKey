-- ── View Count Migration ──────────────────────────────────────────────────────
-- Adds view_count to listings and a SECURITY DEFINER function so any visitor
-- (including anonymous) can increment it without needing UPDATE permission.

-- 1. Add column (idempotent)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- 2. Increment function (SECURITY DEFINER bypasses RLS for this one operation)
CREATE OR REPLACE FUNCTION increment_view_count(listing_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = listing_id;
END;
$$;

-- 3. Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO anon, authenticated;
