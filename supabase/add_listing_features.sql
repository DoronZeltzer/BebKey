-- ============================================================
-- Add Israeli real-estate feature columns to listings
-- Run in Supabase SQL Editor (postgres role)
-- NULL = unknown / not specified; TRUE = has feature; FALSE = does not have
-- ============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS tabu             boolean,
  ADD COLUMN IF NOT EXISTS pinui_binui      boolean,
  ADD COLUMN IF NOT EXISTS tama_38          boolean,
  ADD COLUMN IF NOT EXISTS mamad            boolean,
  ADD COLUMN IF NOT EXISTS parking          boolean,
  ADD COLUMN IF NOT EXISTS elevator         boolean,
  ADD COLUMN IF NOT EXISTS balcony          boolean,
  ADD COLUMN IF NOT EXISTS storage_room     boolean,
  ADD COLUMN IF NOT EXISTS animals_allowed  boolean,
  ADD COLUMN IF NOT EXISTS furnished        boolean,
  ADD COLUMN IF NOT EXISTS air_conditioning boolean,
  ADD COLUMN IF NOT EXISTS accessible       boolean;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN (
    'tabu','pinui_binui','tama_38','mamad','parking','elevator',
    'balcony','storage_room','animals_allowed','furnished','air_conditioning','accessible'
  )
ORDER BY column_name;
