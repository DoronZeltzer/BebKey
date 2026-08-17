-- Phase 2: agency "offices" — team accounts, office profile pages, lead CRM.

-- An office/agency. Public profile at /office/<slug>.
create table if not exists public.offices (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  logo_url      text,
  bio           text,
  phone         text,
  city          text,
  owner_user_id uuid not null,
  created_at    timestamptz not null default now()
);
alter table public.offices enable row level security;

-- Team membership. Owner invites agents by email; linked to user_id on join.
create table if not exists public.office_members (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  user_id    uuid,
  email      text not null,
  role       text not null default 'agent',    -- owner | agent
  status     text not null default 'invited',  -- invited | active
  created_at timestamptz not null default now(),
  unique (office_id, email)
);
alter table public.office_members enable row level security;

-- Listings roll up to an office (for the office profile + team quota).
alter table public.listings add column if not exists office_id uuid;
create index if not exists idx_listings_office on public.listings (office_id) where office_id is not null;

-- Lead CRM: inquiries already have `status`; add free-text notes.
alter table public.inquiries add column if not exists agent_notes text;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Offices: anyone can view a profile; only the owner edits.
drop policy if exists "offices public read" on public.offices;
create policy "offices public read" on public.offices
  for select to anon, authenticated using (true);
drop policy if exists "offices owner write" on public.offices;
create policy "offices owner write" on public.offices
  for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Members: a member sees their own row; the owner manages all rows of their office.
drop policy if exists "office_members read" on public.office_members;
create policy "office_members read" on public.office_members
  for select to authenticated
  using (user_id = auth.uid()
         or office_id in (select id from public.offices where owner_user_id = auth.uid()));
drop policy if exists "office_members owner write" on public.office_members;
create policy "office_members owner write" on public.office_members
  for all to authenticated
  using (office_id in (select id from public.offices where owner_user_id = auth.uid()))
  with check (office_id in (select id from public.offices where owner_user_id = auth.uid()));

-- CLI-created tables need explicit grants (RLS still governs rows).
grant select on public.offices to anon, authenticated;
grant insert, update, delete on public.offices to authenticated;
grant select, insert, update, delete on public.office_members to authenticated;
