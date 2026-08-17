-- BebKey - Telegram bot link fields on filters (saved searches)
--
-- Each saved search gets a one-time token that the user sends to the bot to
-- link their Telegram account.  Once linked, telegram_chat_id is populated
-- and scrapers/telegram_bot_alerts.py will DM them new matching listings.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.filters
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_token   UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS filters_telegram_chat_id_idx
  ON public.filters (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS filters_telegram_token_idx
  ON public.filters (telegram_token);
