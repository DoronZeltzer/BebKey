-- Marketing & attribution dashboard tables (run once in the Supabase SQL editor).
-- Powers the "Marketing" section of /admin/seo:
--   • ad_spend     — what you spent on which ad platform/campaign (manual entry)
--   • acquisitions — where each new signup came from (first-touch, captured client-side)

-- ── Ad spend (manual entry by admins) ───────────────────────────────────────
create table if not exists public.ad_spend (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,                 -- google | facebook | instagram | tiktok | other
  campaign    text,
  amount      numeric not null default 0,
  currency    text not null default 'ILS',
  spend_date  date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.ad_spend enable row level security;

-- Admins only (matches src/lib/adminEmails.ts). Everyone else: no access.
drop policy if exists "ad_spend admin all" on public.ad_spend;
create policy "ad_spend admin all" on public.ad_spend
  for all to authenticated
  using      ((auth.jwt() ->> 'email') in ('admin@bebkey.com','doron@bebkey.com','support@bebkey.com'))
  with check ((auth.jwt() ->> 'email') in ('admin@bebkey.com','doron@bebkey.com','support@bebkey.com'));

-- ── Acquisitions (first-touch source per signup) ────────────────────────────
create table if not exists public.acquisitions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  source        text,           -- google | facebook | instagram | direct | <referrer host> | utm_source
  medium        text,           -- cpc | referral | direct | utm_medium
  campaign      text,
  referrer      text,
  landing_path  text,
  created_at    timestamptz not null default now()
);
alter table public.acquisitions enable row level security;

-- Insert is allowed for anyone (a signup may not have a session yet if email
-- confirmation is on) — rows hold only a source label + user id, no PII.
drop policy if exists "acq insert" on public.acquisitions;
create policy "acq insert" on public.acquisitions
  for insert to anon, authenticated with check (true);

-- Read is admins only.
drop policy if exists "acq admin read" on public.acquisitions;
create policy "acq admin read" on public.acquisitions
  for select to authenticated
  using ((auth.jwt() ->> 'email') in ('admin@bebkey.com','doron@bebkey.com','support@bebkey.com'));

create index if not exists acquisitions_source_idx on public.acquisitions (source);
create index if not exists acquisitions_created_idx on public.acquisitions (created_at);
