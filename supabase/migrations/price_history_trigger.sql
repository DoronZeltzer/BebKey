-- ════════════════════════════════════════════════════════════════════════════
-- price_history_trigger.sql
--
-- Auto-populate `previous_price` whenever a listing's `price` changes.
-- This way every UPSERT path (Yad2 API, Janglo, OnMap refresh, Madlan,
-- Komo, manual edits, etc.) feeds the price-drop email alert pipeline
-- without each scraper having to track this manually.
--
-- Also creates a tiny `listing_price_changes` log table so we can show
-- a price history sparkline on each listing page, and the price-drop
-- alert job can window over "what changed in the last 24h".
--
-- Idempotent - safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Log table -------------------------------------------------------------
create table if not exists listing_price_changes (
  id          bigserial primary key,
  listing_id  uuid not null references listings(id) on delete cascade,
  old_price   integer,
  new_price   integer not null,
  delta       integer generated always as (new_price - coalesce(old_price, new_price)) stored,
  changed_at  timestamptz not null default now()
);

create index if not exists idx_lpc_listing_id_changed_at
  on listing_price_changes(listing_id, changed_at desc);

create index if not exists idx_lpc_changed_at
  on listing_price_changes(changed_at desc);

-- 2) Trigger function ------------------------------------------------------
create or replace function track_price_change() returns trigger
  language plpgsql
  as $$
begin
  -- Only act when price genuinely changed AND we have a real new price.
  -- Skipping cases where price was previously NULL but is now set helps
  -- avoid noise on first-insert (handled by BEFORE INSERT separately).
  if TG_OP = 'UPDATE'
     and new.price is distinct from old.price
     and new.price is not null
     and old.price is not null
  then
    -- Stash old price in previous_price so the front-end sparkline
    -- always has the most recent change to compare against.
    new.previous_price := old.price;

    -- Append to the price-change log (best-effort - never block the row
    -- update if the insert fails for any reason).
    begin
      insert into listing_price_changes (listing_id, old_price, new_price)
      values (new.id, old.price, new.price);
    exception when others then
      raise warning 'track_price_change: log insert failed for listing %: %',
        new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- 3) Wire it up ------------------------------------------------------------
drop trigger if exists trg_track_price_change on listings;
create trigger trg_track_price_change
  before update of price on listings
  for each row
  execute function track_price_change();


-- 4) Dedup table for price-drop email alerts -------------------------------
-- send_price_drop_alerts.py inserts here after a successful email send so
-- the same user never gets two notifications about the same drop.
create table if not exists price_drop_notifications (
  user_id    uuid not null references auth.users(id) on delete cascade,
  change_id  bigint not null references listing_price_changes(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (user_id, change_id)
);

create index if not exists idx_pdn_sent_at
  on price_drop_notifications(sent_at desc);

-- 5) RLS so the front-end can read listing_price_changes for the sparkline
--    chart but cannot tamper with the log.
alter table listing_price_changes enable row level security;

drop policy if exists "anyone can read price changes" on listing_price_changes;
create policy "anyone can read price changes"
  on listing_price_changes
  for select
  to anon, authenticated
  using (true);

-- price_drop_notifications: only the user's own rows are visible
alter table price_drop_notifications enable row level security;
drop policy if exists "user sees own notifications" on price_drop_notifications;
create policy "user sees own notifications"
  on price_drop_notifications
  for select
  to authenticated
  using (user_id = auth.uid());
