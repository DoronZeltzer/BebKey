-- ============================================================================
-- Add Lemon Squeezy columns to user_subscriptions.
--
-- Additive migration only: keep paddle_subscription_id nullable during the
-- transition so we can roll back if LS integration ever needs to be reverted.
-- Zero live subscribers at the time of this migration, so no data migration
-- is needed.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================================

alter table user_subscriptions
  add column if not exists ls_customer_id text,
  add column if not exists ls_subscription_id text,
  add column if not exists ls_customer_portal_url text;

create unique index if not exists idx_user_subscriptions_ls_subscription
  on user_subscriptions (ls_subscription_id)
  where ls_subscription_id is not null;

create index if not exists idx_user_subscriptions_ls_customer
  on user_subscriptions (ls_customer_id)
  where ls_customer_id is not null;

-- paddle_subscription_id may already be NOT NULL from an earlier migration.
-- Relax it so LS-only subscriptions can be inserted without a Paddle ID.
alter table user_subscriptions
  alter column paddle_subscription_id drop not null;
