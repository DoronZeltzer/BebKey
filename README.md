# BebKey - Israel Real Estate Aggregator

[bebkey.com](https://www.bebkey.com) - a full-stack real estate aggregator for the Israeli market. Pulls listings from a dozen sources (Yad2, Madlan, OnMap, Janglo, Komo, Jerusalem Post, Facebook Marketplace, Facebook Groups, Telegram channels) into one searchable platform with multilingual support (Hebrew, English, Russian, Arabic, French) and full RTL.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 · Vite 8 · TypeScript · Tailwind |
| Routing | React Router v7 (lazy-loaded routes) |
| Backend / DB | Supabase (Postgres + RLS + Edge Functions) |
| Hosting | Vercel (static frontend + serverless functions in `api/`) |
| Auth | Supabase + custom PKCE Google OAuth (so consent screen shows `bebkey.com`, not the Supabase project URL) |
| Payments | Lemon Squeezy (Merchant of Record — subscriptions, VAT/tax handled globally by LS) |
| Maps | Leaflet + OpenStreetMap tiles |
| i18n | i18next - 5 languages, RTL-aware |
| Scraping | Python (httpx + BeautifulSoup) for HTTP-only sources, Playwright for JS-heavy sources, Telethon for Telegram, Apify actors for the toughest anti-bot sites |
| Error monitoring | Sentry (frontend + scrapers) |
| Analytics | Vercel Analytics + Speed Insights |

## Project layout

```
src/                   React app (pages, components, hooks, contexts)
api/                   Vercel serverless functions
  auth/google-exchange.ts   PKCE code → Supabase session
  ls-webhook.ts              Lemon Squeezy subscription lifecycle → user_subscriptions
  ls-checkout.ts             Creates hosted LS Checkout session for the current user
  ls-portal.ts               Returns the LS Customer Portal URL for self-manage
  sitemap.xml.ts             Dynamic sitemap from listings table
scrapers/              Python scrapers (run on GitHub Actions, 2× daily)
apify-actors/          Custom Apify actors for Yad2 + Madlan
supabase/              SQL schema, migrations, RPCs, Edge Functions
public/                Static assets (favicon, OG image, manifest, sw.js)
.github/workflows/     CI: scraper cron, Apify actor deploys, weekly cleanup
```

## Getting started

```bash
git clone https://github.com/DoronZeltzer/BebKey.git
cd BebKey
npm install
cp .env.example .env        # fill in the real values
npm run dev                 # → http://localhost:5173
```

To regenerate the OG image after editing `public/og-image.svg`:

```bash
node scripts/build-og-image.mjs   # writes public/og-image.png
```

To run the scrapers locally (Python 3.11+):

```bash
cd scrapers
pip install -r requirements.txt
python janglo_scraper.py   # or any other *_scraper.py
```

## Environment variables

See `.env.example` for the full list. Required to even boot:

- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` - from Supabase dashboard

Required for production features:

- `VITE_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` - for the custom Google sign-in flow
- `LEMONSQUEEZY_API_KEY` + `LEMONSQUEEZY_STORE_ID` + `LEMONSQUEEZY_WEBHOOK_SECRET` (server-side) + `VITE_LS_VARIANT_STARTER/PRO/AGENCY` (client) - to render and complete checkout
- `SUPABASE_SERVICE_ROLE_KEY` - for `api/ls-webhook.ts` and the Python scrapers

Optional:

- `VITE_SENTRY_DSN` - error monitoring (no-op when unset)
- `VITE_ABSTRACT_EMAIL_KEY` - rejects disposable emails at signup (no-op when unset)

## Database

Run `supabase/schema.sql` in the Supabase SQL Editor to create all tables, indexes, RLS policies, and triggers. Other SQL files in `supabase/` apply additive migrations - see `supabase/DB_OPS.md` for the order and intent of each one.

The `listings` table is the heart of the system. Scrapers upsert by `source_url` (deduped via `Prefer: resolution=merge-duplicates`). The admin dashboard at `/admin` shows per-source freshness so you can spot a stalled scraper at a glance.

## Deployment

- **Frontend + API** - push to `master`; Vercel auto-deploys both the Vite build and the `api/` functions. Set all `.env.example` variables in the Vercel project's Environment Variables settings.
- **Scrapers** - run twice daily on GitHub Actions (`.github/workflows/scraper.yml`, cron at 06:00 + 18:00 IL). Set every `secrets.*` referenced in that workflow under Settings → Secrets and variables → Actions.
- **Lemon Squeezy webhooks** - LS dashboard → Settings → Webhooks. Point at `https://www.bebkey.com/api/ls-webhook`, subscribe to the `subscription_*` events, and paste the signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET` in Vercel env. The handler verifies every request's `X-Signature` header (HMAC-SHA256 of the raw body) and fails closed with 500 if the secret is unset.

## License

MIT
