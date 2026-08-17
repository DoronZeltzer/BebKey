-- ============================================================================
-- Pending boost intents for Grow (Meshulam) one-time boost payments.
--
-- A boost payment tells us WHO paid (payer email) and HOW MUCH (which maps to
-- the boost type), but NOT which listing to boost — the customer never types a
-- listing id on Grow's hosted page. So when a user clicks "Boost" on a listing,
-- /api/grow-checkout records the intent here BEFORE redirecting to Grow; the
-- webhook then matches the payment to the most recent unfulfilled intent for
-- that user + boost type and applies it. Robust even if Grow doesn't echo our
-- custom fields back.
-- ============================================================================

create table if not exists pending_boosts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  listing_id  uuid not null,
  boost_type  text not null,     -- bump | tag | featured | spotlight
  fulfilled   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Lookup: newest unfulfilled intent per (user, boost_type).
create index if not exists idx_pending_boosts_lookup
  on pending_boosts (user_id, boost_type, created_at desc)
  where fulfilled = false;

-- Written/read only by the service_role (grow-checkout + grow-webhook). RLS on
-- with no policy denies anon/authenticated; CLI-created tables need the explicit
-- grant.
alter table pending_boosts enable row level security;
grant all on public.pending_boosts to service_role;
