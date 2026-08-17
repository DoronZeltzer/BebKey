-- ============================================================
-- Create inquiries table
-- Run once in Supabase SQL Editor
-- ============================================================

create table if not exists inquiries (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- Which listing this inquiry is about
  listing_id     uuid references listings(id) on delete set null,

  -- Buyer details (no auth required - anonymous users can inquire)
  buyer_name     text not null,
  buyer_phone    text not null,
  buyer_email    text,
  message        text,

  -- Which agent/user should receive this (null = scraped listing, goes to support)
  agent_user_id  uuid references auth.users(id) on delete set null,

  -- Status tracking
  status         text not null default 'new'   -- 'new' | 'read' | 'replied'
);

-- Index for agents querying their own inquiries
create index if not exists idx_inquiries_agent
  on inquiries (agent_user_id, created_at desc);

create index if not exists idx_inquiries_listing
  on inquiries (listing_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table inquiries enable row level security;

-- Anyone (including anon) can submit an inquiry
create policy "anyone can insert inquiry"
  on inquiries for insert
  to anon, authenticated
  with check (true);

-- Agents can read inquiries directed at them
create policy "agents read own inquiries"
  on inquiries for select
  to authenticated
  using (agent_user_id = auth.uid());

-- Agents can mark inquiries as read/replied
create policy "agents update own inquiries"
  on inquiries for update
  to authenticated
  using (agent_user_id = auth.uid())
  with check (agent_user_id = auth.uid());

-- ── Done ─────────────────────────────────────────────────────────────────────
select count(*) as inquiries_count from inquiries;
