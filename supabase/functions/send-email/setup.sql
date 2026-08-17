-- ─────────────────────────────────────────────────────────────────────────────
-- Email notification trigger via Supabase Database Webhook
-- Run this ONCE in the Supabase SQL Editor after deploying the Edge Function.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the inquiries table (for buyer → agent contact form)
CREATE TABLE IF NOT EXISTS public.inquiries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_name    text NOT NULL,
  buyer_phone   text NOT NULL,
  buyer_email   text,
  message       text,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Agents can read inquiries for their own listings
CREATE POLICY "agents read own inquiries" ON public.inquiries
  FOR SELECT USING (
    agent_user_id = auth.uid()
  );

-- Anyone can insert (anonymous buyers)
CREATE POLICY "anyone can submit inquiry" ON public.inquiries
  FOR INSERT WITH CHECK (true);

-- 2. Index for agent lookups
CREATE INDEX IF NOT EXISTS inquiries_agent_idx ON public.inquiries(agent_user_id);
CREATE INDEX IF NOT EXISTS inquiries_listing_idx ON public.inquiries(listing_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: Set up a Database Webhook in the Supabase Dashboard:
--   Dashboard → Database → Webhooks → Create new webhook
--   Table:  notifications
--   Events: INSERT
--   URL:    https://<project-ref>.supabase.co/functions/v1/send-email
--   Method: POST
--   Headers: Content-Type: application/json
--             Authorization: Bearer <service_role_key>
--
-- The Edge Function is called with the raw INSERT payload.
-- Alternatively, call the function directly from your frontend after inserting
-- an inquiry:
--   await supabase.functions.invoke('send-email', { body: { type, data } })
-- ─────────────────────────────────────────────────────────────────────────────
