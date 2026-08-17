-- Migration: lock listings when subscription is canceled
-- Run in Supabase SQL Editor

-- 1. Add is_locked column to listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- 2. Update the public read policy to also exclude locked listings
DROP POLICY IF EXISTS "public can read active listings" ON listings;
CREATE POLICY "public can read active listings" ON listings FOR SELECT USING (is_active = true AND is_locked = false);
