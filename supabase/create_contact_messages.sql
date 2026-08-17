-- ============================================================================
-- contact_messages - submissions from the public /contact form
--
-- Separate from the `inquiries` table (which is buyer-to-agent about a
-- specific listing) because the contact form is general support: it has a
-- category, an optional listing URL, and phone is optional rather than
-- required.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================================

create table if not exists contact_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Visitor input
  name         text not null,
  email        text not null,
  phone        text,
  category     text not null check (category in (
    'general',
    'listing_issue',
    'agent_plans',
    'bug',
    'press',
    'privacy'
  )),
  listing_url  text,
  message      text not null,

  -- If a logged-in user submits, link it back to them.  Anonymous senders
  -- leave this null.
  user_id      uuid references auth.users(id) on delete set null,

  -- Spam / abuse tracking captured server-side by /api/contact
  ip_address   inet,
  user_agent   text,

  -- Workflow
  status       text not null default 'new'   -- 'new' | 'read' | 'replied' | 'spam'
);

create index if not exists idx_contact_messages_status_created
  on contact_messages (status, created_at desc);

create index if not exists idx_contact_messages_category
  on contact_messages (category);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table contact_messages enable row level security;

-- Submissions go through /api/contact (which uses the service-role key and
-- bypasses RLS), but allow anon inserts too as a defensive fallback.  No
-- SELECT / UPDATE / DELETE policies for anon - admins read from the
-- Supabase dashboard or via service-role queries.
create policy "anyone can submit contact message"
  on contact_messages for insert
  to anon, authenticated
  with check (true);

-- Allow logged-in users to read their own submissions so the UI can show
-- "your previous messages" later (Phase 2 feature).
create policy "users read own contact messages"
  on contact_messages for select
  to authenticated
  using (user_id = auth.uid());

-- ── Done ────────────────────────────────────────────────────────────────────
select count(*) as contact_messages_count from contact_messages;
