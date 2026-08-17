-- ════════════════════════════════════════════════════════════════════════════
-- whatsapp_alerts.sql
--
-- Wire WhatsApp delivery for saved-search alerts (Task #21).
--
-- Israeli market preference: many users prefer WhatsApp over email for
-- timely listing alerts.  Counter to keyz.ai's WhatsApp-native UX.
--
-- 1) Extend the existing `filters` (saved-search) table with a phone
--    number + opt-in flag so users can choose WhatsApp delivery per
--    saved search.
-- 2) Tiny `whatsapp_notifications` log so we don't double-send if the
--    job re-runs.
--
-- Idempotent - safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Add WhatsApp opt-in fields to existing filters table -----------------
alter table filters
  add column if not exists notify_whatsapp     boolean not null default false,
  add column if not exists whatsapp_number     text;          -- E.164 format: +972501234567

-- Index so the alert job can quickly find filters with WhatsApp enabled
create index if not exists idx_filters_whatsapp_active
  on filters(is_active, notify_whatsapp)
  where notify_whatsapp = true;

-- 2) Dedup log so a re-run of the job doesn't double-send ----------------
create table if not exists whatsapp_notifications (
  id            bigserial primary key,
  filter_id     uuid not null references filters(id) on delete cascade,
  listing_id    uuid not null references listings(id) on delete cascade,
  whatsapp_number text not null,
  twilio_sid    text,        -- Twilio message SID for debugging
  sent_at       timestamptz not null default now(),
  unique (filter_id, listing_id)
);

create index if not exists idx_wn_sent_at
  on whatsapp_notifications(sent_at desc);

-- 3) RLS - users see only their own notifications --------------------------
alter table whatsapp_notifications enable row level security;

drop policy if exists "user sees own whatsapp notifications" on whatsapp_notifications;
create policy "user sees own whatsapp notifications"
  on whatsapp_notifications
  for select
  to authenticated
  using (filter_id in (select id from filters where user_id = auth.uid()));
