-- Listing boosts: paid promotions on a single listing.
-- "Featured" already exists (is_featured + featured_until). Add the other three
-- boost types as their own expiry columns so display can check `<col> > now()`.

alter table public.listings add column if not exists spotlight_until timestamptz;  -- Homepage spotlight
alter table public.listings add column if not exists bump_until      timestamptz;  -- Auto-refresh / bump
alter table public.listings add column if not exists last_bumped_at  timestamptz;  -- last time the bump re-floated it
alter table public.listings add column if not exists tag_kind        text;         -- 'hot' | 'reduced'
alter table public.listings add column if not exists tag_until       timestamptz;  -- urgent/price-drop tag expiry

create index if not exists idx_listings_spotlight on public.listings (spotlight_until) where spotlight_until is not null;
create index if not exists idx_listings_tag       on public.listings (tag_until)       where tag_until is not null;
create index if not exists idx_listings_bump      on public.listings (bump_until)      where bump_until is not null;

-- One row per boost purchase/grant. The Paddle webhook (or an admin) writes here
-- and sets the matching listings.*_until column; display reads the columns.
create table if not exists public.boost_orders (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  agent_id    uuid,
  boost_type  text not null,                    -- featured | spotlight | bump | tag
  amount      numeric not null default 0,
  currency    text not null default 'ILS',
  days        int not null default 7,
  tag_kind    text,                             -- for boost_type='tag'
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  status      text not null default 'active',   -- active | expired | refunded
  paddle_txn  text,
  created_at  timestamptz not null default now()
);
alter table public.boost_orders enable row level security;

-- Agents read their own orders; admins read all. Writes happen server-side
-- (Paddle webhook / admin) via the service-role key, which bypasses RLS.
drop policy if exists "boost_orders own read" on public.boost_orders;
create policy "boost_orders own read" on public.boost_orders
  for select to authenticated
  using (
    agent_id = auth.uid()
    or (auth.jwt() ->> 'email') in ('admin@bebkey.com','doron@bebkey.com','support@bebkey.com')
  );

create index if not exists idx_boost_orders_listing on public.boost_orders (listing_id);
create index if not exists idx_boost_orders_agent   on public.boost_orders (agent_id);

-- CLI-created tables don't inherit Supabase's default grants; RLS still applies.
grant select on public.boost_orders to authenticated;
