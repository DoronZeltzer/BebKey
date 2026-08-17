-- BebKey Database Schema
-- Paste this into the Supabase SQL Editor and run it.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,                        -- yad2 | madlan | facebook_marketplace | facebook_group | manual | agent_manual
  source_url text unique,
  price integer,
  city text,
  street text,
  neighborhood text,
  size_m2 numeric,
  rooms numeric,
  floor integer,
  total_floors integer,
  property_type text,                          -- apartment | house | penthouse | land | commercial
  condition text,                              -- new | renovated | needs_work
  description text,
  images text[],
  contact_phone text,
  scraped_at timestamptz default now(),
  posted_by_user_id uuid references auth.users(id) on delete set null,
  is_active boolean default true,
  view_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('buyer','agent','private','admin')) default 'buyer',
  plan text not null default 'free',
  preferred_language text not null default 'he',
  stripe_customer_id text,
  is_banned boolean default false,
  created_at timestamptz default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  agency_name text,
  phone text,
  bio text,
  logo_url text
);

create table if not exists agent_clients (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  client_name text not null,
  phone text,
  budget_min integer,
  budget_max integer,
  preferred_cities text[],
  preferred_streets text[],
  min_rooms numeric,
  max_rooms numeric,
  min_size_m2 numeric,
  property_types text[],
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text,
  city text,
  street text,
  price_min integer,
  price_max integer,
  rooms_min numeric,
  size_min numeric,
  property_type text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  client_id uuid not null references agent_clients(id) on delete cascade,
  matched_fields text[],
  is_read boolean default false,
  sent_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan text not null,
  stripe_subscription_id text,
  status text not null default 'active',       -- active | cancelled | past_due
  current_period_end timestamptz,
  created_at timestamptz default now()
);

create table if not exists admin_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id),
  action_type text not null,
  target_id uuid,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_listings_city        on listings(city);
create index if not exists idx_listings_price       on listings(price);
create index if not exists idx_listings_rooms       on listings(rooms);
create index if not exists idx_listings_is_active   on listings(is_active);
create index if not exists idx_listings_scraped_at  on listings(scraped_at desc);
create index if not exists idx_listings_source      on listings(source);
create index if not exists idx_notifications_agent  on notifications(agent_id);
create index if not exists idx_agent_clients_agent  on agent_clients(agent_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table listings        enable row level security;
alter table users           enable row level security;
alter table agents          enable row level security;
alter table agent_clients   enable row level security;
alter table filters         enable row level security;
alter table notifications   enable row level security;
alter table subscriptions   enable row level security;

-- Listings: anyone can read active listings; owners can manage their own
create policy "public can read active listings"
  on listings for select
  to anon, authenticated
  using (is_active = true);

create policy "owners can manage own listings"
  on listings for all
  using (posted_by_user_id = auth.uid())
  with check (posted_by_user_id = auth.uid());

-- Users: users can read/update their own row
create policy "users can read own profile"
  on users for select using (id = auth.uid());

create policy "users can update own profile"
  on users for update using (id = auth.uid());

-- Agents: agents can read/update their own row
create policy "agents manage own row"
  on agents for all using (user_id = auth.uid());

-- Agent clients: agents can only see/modify their own clients
create policy "agents manage own clients"
  on agent_clients for all
  using (agent_id in (select id from agents where user_id = auth.uid()))
  with check (agent_id in (select id from agents where user_id = auth.uid()));

-- Filters: users manage their own
create policy "users manage own filters"
  on filters for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notifications: agents only see their own
create policy "agents see own notifications"
  on notifications for all
  using (agent_id in (select id from agents where user_id = auth.uid()));

-- Subscriptions: users see their own
create policy "users see own subscriptions"
  on subscriptions for select using (user_id = auth.uid());

-- ============================================================
-- MATCHING ENGINE TRIGGER
-- Fires after every INSERT on listings.
-- Compares listing fields to all active agent_clients.
-- Inserts a notification row for each match.
-- ============================================================

create or replace function match_listing_to_clients()
returns trigger
language plpgsql
security definer
as $$
declare
  client_row  agent_clients%rowtype;
  agent_row   agents%rowtype;
  matched     text[];
begin
  for client_row in
    select *
    from agent_clients
    where is_active = true
      -- City: match if preferred_cities is empty OR contains new listing city
      and (
        preferred_cities is null
        or cardinality(preferred_cities) = 0
        or NEW.city = any(preferred_cities)
      )
      -- Budget: price must be within budget range
      and (budget_min is null or NEW.price >= budget_min)
      and (budget_max is null or NEW.price <= budget_max)
      -- Rooms: listing rooms >= client minimum
      and (min_rooms is null or NEW.rooms >= min_rooms)
      -- Size: listing size >= client minimum
      and (min_size_m2 is null or NEW.size_m2 >= min_size_m2)
      -- Property type: match if client has no preference OR listing matches
      and (
        property_types is null
        or cardinality(property_types) = 0
        or NEW.property_type = any(property_types)
      )
  loop
    -- Build array of which fields matched for the notification
    matched := array[]::text[];
    if NEW.city = any(coalesce(client_row.preferred_cities, array[]::text[])) then
      matched := array_append(matched, 'city');
    end if;
    if NEW.price between coalesce(client_row.budget_min, 0) and coalesce(client_row.budget_max, 999999999) then
      matched := array_append(matched, 'price');
    end if;
    if client_row.min_rooms is not null and NEW.rooms >= client_row.min_rooms then
      matched := array_append(matched, 'rooms');
    end if;
    if client_row.min_size_m2 is not null and NEW.size_m2 >= client_row.min_size_m2 then
      matched := array_append(matched, 'size');
    end if;
    if NEW.property_type = any(coalesce(client_row.property_types, array[]::text[])) then
      matched := array_append(matched, 'property_type');
    end if;

    insert into notifications (agent_id, listing_id, client_id, matched_fields)
    values (client_row.agent_id, NEW.id, client_row.id, matched);
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trigger_match_listing on listings;

create trigger trigger_match_listing
  after insert on listings
  for each row
  execute function match_listing_to_clients();
