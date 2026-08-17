-- ============================================================================
-- Grow (Meshulam) payments — hosted payment-page + webhook integration.
--
-- We use Grow's hosted "permanent payment pages" (one per plan, billed monthly
-- as a standing order / הוראת קבע) instead of the clearing API — cheaper to
-- start. Grow POSTs a webhook to /api/grow-webhook on every charge; that
-- handler mirrors subscription state into the columns below.
--
-- Attribution (no API => no per-user token at redirect time):
--   * plan  is identified by which page was paid  -> purchasePageKey
--   * user  is identified by the payer's email     -> payerEmail
--   * renewals (2nd+ standing-order charges) are matched by the recurring id
--     (recurringDebitId) captured on the first charge.
--
-- Additive only. The Paddle/Lemon-Squeezy columns are left untouched so the
-- old code paths keep compiling and we can roll back.
-- ============================================================================

alter table user_subscriptions
  add column if not exists grow_recurring_id  text,  -- recurringDebitId: matches 2nd+ standing-order charges
  add column if not exists grow_payer_email   text,  -- email the customer paid with (attribution + reference)
  add column if not exists grow_page_key      text,  -- purchasePageKey of the plan page that was paid
  add column if not exists grow_last_asmachta text;  -- last transaction reference (asmachta)

create index if not exists idx_user_subscriptions_grow_recurring
  on user_subscriptions (grow_recurring_id)
  where grow_recurring_id is not null;

create index if not exists idx_user_subscriptions_grow_email
  on user_subscriptions (grow_payer_email)
  where grow_payer_email is not null;

-- ----------------------------------------------------------------------------
-- Safety net: charges the webhook could not tie to a Supabase user (e.g. the
-- customer paid with an email that is not their BebKey account email). Instead
-- of dropping the payment, the webhook records it here so an admin can reconcile
-- (link it to the right user) from the SQL editor / admin panel. Never lose a
-- payment.
-- ----------------------------------------------------------------------------
create table if not exists grow_unmatched_payments (
  id             uuid primary key default gen_random_uuid(),
  payer_email    text,
  full_name      text,
  payer_phone    text,
  page_key       text,
  plan           text,
  payment_sum    numeric,
  payment_type   text,        -- רגיל / תשלומים / הוראת קבע
  transaction_id text,
  asmachta       text,
  recurring_id   text,
  raw            jsonb,        -- full webhook payload for manual inspection
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- PII (emails/phones) — never expose to the frontend. RLS on with no policy
-- denies anon/authenticated entirely; the webhook writes via the service_role
-- (which bypasses RLS). Admin reconciliation happens via the SQL editor or a
-- future service-role admin endpoint.
alter table grow_unmatched_payments enable row level security;

-- CLI-created tables don't inherit Supabase's default grants — grant the
-- service_role explicitly so the webhook can insert/select.
grant all on public.grow_unmatched_payments to service_role;

-- ----------------------------------------------------------------------------
-- Look up a Supabase auth user by email so the webhook can attribute a Grow
-- payment (which only tells us the payer's email) to the right account.
-- SECURITY DEFINER so it can read auth.users; execute is granted ONLY to the
-- service_role (the webhook), never to anon/authenticated — it must not be a
-- public email->id oracle.
-- ----------------------------------------------------------------------------
create or replace function get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email))
  order by created_at asc
  limit 1;
$$;

revoke all on function get_user_id_by_email(text) from public;
revoke all on function get_user_id_by_email(text) from anon;
revoke all on function get_user_id_by_email(text) from authenticated;
grant execute on function get_user_id_by_email(text) to service_role;
