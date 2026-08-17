-- ============================================================================
-- RLS hardening pass (2026-07-02)
--
-- Findings from `pg_policies` audit:
--
-- 1. `listings` UPDATE policy had a USING clause but no WITH CHECK.  The
--    consequence: an authenticated user could UPDATE their own listing AND
--    rewrite `posted_by_user_id` to another user's uid, effectively
--    transferring ownership.  Fix: add a matching WITH CHECK so the row
--    still belongs to `auth.uid()` after the update.
--
-- 2. `inquiries` had TWO overlapping INSERT policies — one for the `public`
--    role, one for `anon,authenticated`.  `public` is a superset of the
--    other two, so the second policy is redundant.  Dropping to reduce
--    surface area (and clean pg_policies output).
--
-- Every other RLS/policy the audit checked was correctly least-privilege:
-- SELECT/UPDATE/DELETE on user-owned tables all scope on `auth.uid()`,
-- and the `boost_orders` admin-email allow-list works as intended.  This
-- migration only touches the two findings above.
-- ============================================================================

-- ── 1. Add WITH CHECK to listings UPDATE ────────────────────────────────
drop policy if exists "Users can update own listings" on public.listings;

create policy "Users can update own listings"
  on public.listings
  for update
  to authenticated
  using      (posted_by_user_id = auth.uid())
  with check (posted_by_user_id = auth.uid());

-- ── 2. Drop the redundant INSERT policy on inquiries ────────────────────
-- Keeps "anyone can submit inquiry" (broader `public` role, same effect).
drop policy if exists "anyone can insert inquiry" on public.inquiries;
