-- Run this in Supabase SQL Editor
-- Creates the user_subscriptions table for tracking subscriptions + trial history.
-- paddle_subscription_id is a legacy column kept nullable so existing rows
-- (pre-2026-07 Paddle migration) still validate; new subscriptions live in
-- the ls_* columns.

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id  TEXT,          -- legacy, nullable
  ls_customer_id          TEXT,          -- Lemon Squeezy customer id (numeric string)
  ls_subscription_id      TEXT,          -- Lemon Squeezy subscription id
  plan                    TEXT,          -- 'starter' | 'pro' | 'agency'
  status                  TEXT,          -- LS: 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired'
  has_had_trial           BOOLEAN NOT NULL DEFAULT false,
  trial_ends_at           TIMESTAMPTZ,
  current_period_ends_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update (via webhook)
CREATE POLICY "Service role can manage subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');
