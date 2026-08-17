-- Table-level privileges for the marketing tables.
-- Supabase auto-grants anon/authenticated on tables created in the SQL editor,
-- but tables created via a CLI migration (temp login role) don't inherit those
-- default privileges, so the grants must be explicit. RLS still governs which
-- ROWS each role can touch (see 20260623120000_marketing_dashboard.sql).

-- Admin CRUD on ad spend (RLS restricts rows to admin emails).
grant select, insert, update, delete on public.ad_spend to authenticated;

-- Signups (often pre-session / anon) insert their first-touch source; admins read.
grant insert on public.acquisitions to anon, authenticated;
grant select on public.acquisitions to authenticated;
