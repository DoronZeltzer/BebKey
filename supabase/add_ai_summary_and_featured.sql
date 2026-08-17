-- Migration: add ai_summary, is_featured, featured_until columns + related index & trigger
-- Idempotent - safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_summary TEXT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings' AND column_name = 'ai_summary'
    ) THEN
        ALTER TABLE listings ADD COLUMN ai_summary TEXT;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. is_featured BOOLEAN DEFAULT false
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings' AND column_name = 'is_featured'
    ) THEN
        ALTER TABLE listings ADD COLUMN is_featured BOOLEAN DEFAULT false;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. featured_until TIMESTAMPTZ
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings' AND column_name = 'featured_until'
    ) THEN
        ALTER TABLE listings ADD COLUMN featured_until TIMESTAMPTZ;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Partial index for fast featured listing lookups
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_featured
    ON listings (is_featured, featured_until)
    WHERE is_featured = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Auto-deactivate trigger - clears is_featured once featured_until lapses
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_expire_featured()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_featured = true
       AND NEW.featured_until IS NOT NULL
       AND NEW.featured_until < now()
    THEN
        NEW.is_featured := false;
    END IF;
    RETURN NEW;
END;
$$;

-- Drop and recreate the trigger so this migration stays idempotent
DROP TRIGGER IF EXISTS trg_expire_featured ON listings;

CREATE TRIGGER trg_expire_featured
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION fn_expire_featured();
