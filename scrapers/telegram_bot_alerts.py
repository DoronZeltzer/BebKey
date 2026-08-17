"""
BebKey - Telegram saved-search alert bot (push side).

Pairs with the existing `send_alerts.py` flow.  Instead of (or in addition to)
email alerts, this script pushes new matching listings as DMs to users who
have linked their Telegram account to their saved search.

How users link their Telegram:
  1. They open BebKey, go to their saved search, copy a short token (UUID).
  2. They open Telegram and DM the @bebkey_bot the token.
  3. The bot (separate webhook, not in this file) writes their
     telegram_chat_id into the `filters` row matching the token.

This file ONLY pushes outbound DMs - it does NOT poll incoming messages.
Run it after every scraper cycle.

Required env vars:
  TELEGRAM_BOT_TOKEN     - from @BotFather (NOT the user session)
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Schema additions needed (already added by add_telegram_bot.sql):
  filters.telegram_chat_id  BIGINT  - nullable, set after linking
  filters.telegram_token    UUID    - DEFAULT gen_random_uuid()
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv
from monitoring import init_sentry

init_sentry("telegram_bot")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "telegram_bot_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BOT_TOKEN    = os.getenv("TELEGRAM_BOT_TOKEN", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: missing Supabase env vars"); sys.exit(1)
if not BOT_TOKEN:
    print("TELEGRAM_BOT_TOKEN not set - skipping bot alerts.  "
          "Create one with @BotFather and add the token as a GitHub Secret.")
    sys.exit(0)

REST_URL  = f"{SUPABASE_URL}/rest/v1"
TG_API    = f"https://api.telegram.org/bot{BOT_TOKEN}"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def send_dm(client: httpx.Client, chat_id: int, text: str, image: str | None = None) -> bool:
    """Send a Telegram message - photo with caption if image provided."""
    try:
        if image:
            r = client.post(
                f"{TG_API}/sendPhoto",
                data={
                    "chat_id":    chat_id,
                    "photo":      image,
                    "caption":    text[:1024],
                    "parse_mode": "Markdown",
                },
                timeout=15,
            )
            if r.status_code == 200:
                return True
            # Fall back to plain text if photo upload fails (e.g. invalid URL)
            log(f"  sendPhoto {r.status_code}: {r.text[:120]} - falling back to plain text")
        r = client.post(
            f"{TG_API}/sendMessage",
            json={
                "chat_id":    chat_id,
                "text":       text[:4000],
                "parse_mode": "Markdown",
                "disable_web_page_preview": False,
            },
            timeout=15,
        )
        return r.status_code == 200
    except Exception as e:
        log(f"  TG exception: {e}")
        return False


def format_listing(listing: dict) -> str:
    parts: list[str] = []
    price = listing.get("price")
    deal_type = listing.get("deal_type")
    city  = listing.get("city") or "?"
    rooms = listing.get("rooms")
    size  = listing.get("size_m2")
    url   = listing.get("source_url") or ""

    if price:
        suffix = " ₪ / חודש" if deal_type == "rent" else " ₪"
        parts.append(f"*₪{price:,}*{suffix}".replace(",", ",").rstrip())
    parts.append(f"📍 {city}")
    if rooms is not None:
        parts.append(f"🛏 {rooms} חדרים")
    if size is not None:
        parts.append(f"📐 {size:.0f} מ\"ר")
    if url:
        parts.append(f"[פתח מודעה ↗]({url})")
    return "\n".join(parts)


def fetch_linked_filters(client: httpx.Client) -> list[dict]:
    r = client.get(
        f"{REST_URL}/filters",
        headers={**SB_HEADERS, "Prefer": ""},
        params={
            "select": "id,name,city,price_min,price_max,rooms_min,property_type,"
                      "deal_type,telegram_chat_id,last_notified_at",
            "is_active":          "eq.true",
            "telegram_chat_id":   "not.is.null",
            "limit":              "1000",
        },
        timeout=15,
    )
    return r.json() if r.status_code == 200 else []


def matching_listings(client: httpx.Client, f: dict) -> list[dict]:
    cutoff = f.get("last_notified_at") or (
        datetime.now(timezone.utc) - timedelta(hours=24)
    ).isoformat()
    params: list[tuple[str, str]] = [
        ("select",     "id,city,street,price,rooms,size_m2,images,deal_type,source_url"),
        ("is_active",  "eq.true"),
        ("scraped_at", f"gte.{cutoff}"),
        ("limit",      "5"),
        ("order",      "scraped_at.desc"),
    ]
    if f.get("city"):
        params.append(("city", f"ilike.*{f['city']}*"))
    if f.get("price_min") is not None:
        params.append(("price", f"gte.{f['price_min']}"))
    if f.get("price_max") is not None:
        params.append(("price", f"lte.{f['price_max']}"))
    if f.get("rooms_min") is not None:
        params.append(("rooms", f"gte.{f['rooms_min']}"))
    if f.get("property_type"):
        params.append(("property_type", f"eq.{f['property_type']}"))
    if f.get("deal_type"):
        params.append(("deal_type", f"eq.{f['deal_type']}"))

    r = client.get(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": ""},
        params=params,
        timeout=15,
    )
    return r.json() if r.status_code == 200 else []


def _first_img(images) -> str | None:
    if not images: return None
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, str): return first
        if isinstance(first, dict): return first.get("url")
    return None


def main() -> None:
    log("BebKey Telegram bot alerter starting")
    with httpx.Client() as client:
        filters = fetch_linked_filters(client)
        log(f"Found {len(filters)} linked filter(s)")
        sent_total = 0
        for f in filters:
            chat_id = f.get("telegram_chat_id")
            if not chat_id:
                continue
            matches = matching_listings(client, f)
            if not matches:
                continue

            header = f"🏠 *{f.get('name') or f.get('city') or 'Saved search'}* - "
            header += f"{len(matches)} new"
            try:
                send_dm(client, int(chat_id), header)
            except Exception:
                pass

            sent_here = 0
            for listing in matches[:5]:
                ok = send_dm(client, int(chat_id),
                             format_listing(listing),
                             _first_img(listing.get("images")))
                if ok:
                    sent_here += 1
                    sent_total += 1

            if sent_here > 0:
                # Bump last_notified_at so the next run doesn't repeat itself
                try:
                    client.patch(
                        f"{REST_URL}/filters",
                        headers={**SB_HEADERS, "Prefer": "return=minimal"},
                        params={"id": f"eq.{f['id']}"},
                        json={"last_notified_at": datetime.now(timezone.utc).isoformat()},
                        timeout=10,
                    )
                except Exception as e:
                    log(f"  ⚠ Could not update last_notified_at: {e}")

            log(f"  ✓ filter {f['id']}: sent {sent_here}/{len(matches)} to chat {chat_id}")

    log(f"DONE - {sent_total} Telegram DMs sent")


if __name__ == "__main__":
    main()
