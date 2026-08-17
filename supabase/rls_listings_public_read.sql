-- ============================================================
-- RLS: Public read access for active listings
-- ============================================================
-- Run this in the Supabase SQL Editor (as postgres role) if the
-- "Public can read active listings" policy is ever missing.
-- This can happen when the project is paused/restored on the free tier.
--
-- Signs that this policy is missing:
--   - The home page shows 0 Listings / 0 Cities
--   - A direct API call with the anon key returns content-range: */0
-- ============================================================

DROP POLICY IF EXISTS "Public can read active listings" ON listings;
DROP POLICY IF EXISTS "public can read active listings" ON listings;

CREATE POLICY "Public can read active listings"
  ON listings
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Verify: should return the policy row
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'listings'
  AND policyname ILIKE '%active listings%';
