"""
BebKey - WhatsApp Saved-Search Alerts (Task #21)

Counter to keyz.ai's WhatsApp-native UX: when a new listing matches a
user's saved search AND they've opted into WhatsApp delivery, send the
listing details directly via Meta's WhatsApp Cloud API (no Twilio).

DELIVERY PROVIDERS (in priority order):
  1. Meta WhatsApp Cloud API direct (RECOMMENDED — cheapest, one less vendor)
     Set: META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID
     Cost: ~$0.027/conversation in Israel (vs $0.032 via Twilio)
     Free tier: 1,000 conversations/month built-in
     Setup: developers.facebook.com/apps → WhatsApp Business → get token + phone number ID
  2. Twilio (fallback / for sandbox testing only)
     Set: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
     Use only for the testing phase if you can't get Meta approval immediately
  3. None — dry-run mode that logs what would have been sent

Architecture mirrors send_alerts.py (the email pipeline) — same matching
logic against the `filters` table, same per-(filter, listing) dedup.

MESSAGE TYPES — Meta WhatsApp distinguishes:
  - Free-form text: only allowed in 24h "customer service window" after
    a user message to you.  Cheaper.
  - Template message: pre-approved by Meta, can be sent any time.
    Required for FIRST contact + alerts outside the 24h window.
  This script sends a TEMPLATE message by default (works always) with
  fallback to text if WHATSAPP_USE_TEXT=true.

Required env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

  # Pick ONE provider:
  META_WHATSAPP_TOKEN        — Meta Cloud API bearer token (recommended)
  META_PHONE_NUMBER_ID       — the phone number ID from Meta Business Manager
  META_TEMPLATE_NAME         — default 'bebkey_listing_alert' (you create this in
                               Meta Business Manager once, then it's reusable)
  META_TEMPLATE_LANGUAGE     — default 'en_US' (use 'he' if you want Hebrew template)

  ── OR ──
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_WHATSAPP_FROM       — default 'whatsapp:+14155238886' (sandbox)
"""
import os
import sys
import base64
import json
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "whatsapp_alerts_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Meta WhatsApp Cloud API (primary provider)
META_TOKEN           = os.getenv("META_WHATSAPP_TOKEN", "")
META_PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID", "")
META_TEMPLATE_NAME   = os.getenv("META_TEMPLATE_NAME", "bebkey_listing_alert")
META_TEMPLATE_LANG   = os.getenv("META_TEMPLATE_LANGUAGE", "en_US")
META_GRAPH_VERSION   = os.getenv("META_GRAPH_VERSION", "v21.0")
WHATSAPP_USE_TEXT    = os.getenv("WHATSAPP_USE_TEXT", "").lower() in ("1", "true", "yes")

# Twilio (fallback for testing / sandbox)
TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

WINDOW_HOURS    = int(os.getenv("WHATSAPP_WINDOW_HOURS", "24"))
MAX_PER_FILTER  = int(os.getenv("WHATSAPP_MAX_PER_FILTER", "3"))


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Provider: Meta WhatsApp Cloud API direct (PRIMARY, ~15% cheaper) ──────
def _send_via_meta(to_number: str, body: str,
                    template_params: list[str] | None = None) -> str | None:
    """Send via Meta WhatsApp Cloud API.  Returns message ID on success.

    Outside the 24h customer-service window (the default for outbound
    alerts), Meta requires a pre-approved TEMPLATE.  The template must
    be created once in Meta Business Manager:
      Name:        bebkey_listing_alert (or your META_TEMPLATE_NAME)
      Category:    UTILITY
      Language:    en_US (or per META_TEMPLATE_LANGUAGE)
      Body:        "{{1}}"   (single body param — we substitute the full text)
    """
    to = to_number.lstrip("+").replace("whatsapp:", "")
    url = (f"https://graph.facebook.com/{META_GRAPH_VERSION}/"
           f"{META_PHONE_NUMBER_ID}/messages")
    headers = {
        "Authorization": f"Bearer {META_TOKEN}",
        "Content-Type":  "application/json",
    }

    if WHATSAPP_USE_TEXT:
        # Free-form text — only works within 24h customer service window
        payload: dict = {
            "messaging_product": "whatsapp",
            "to":   to,
            "type": "text",
            "text": {"body": body[:4096]},
        }
    else:
        # Template — works any time but requires Meta-approved template
        payload = {
            "messaging_product": "whatsapp",
            "to":   to,
            "type": "template",
            "template": {
                "name":     META_TEMPLATE_NAME,
                "language": {"code": META_TEMPLATE_LANG},
                "components": [{
                    "type": "body",
                    "parameters": [{
                        "type": "text",
                        # Templates allow 1024 chars per param; clamp the body
                        "text": (template_params[0] if template_params else body)[:1024],
                    }],
                }],
            },
        }

    try:
        r = httpx.post(url, headers=headers, json=payload, timeout=15)
        if r.status_code in (200, 201):
            data = r.json()
            messages = data.get("messages") or []
            return messages[0].get("id") if messages else None
        log(f"  ! Meta HTTP {r.status_code}: {r.text[:250]}")
        return None
    except Exception as e:
        log(f"  ! Meta exception: {e}")
        return None


# ── Provider: Twilio (fallback for sandbox / testing) ─────────────────────
def _send_via_twilio(to_number: str, body: str) -> str | None:
    to = to_number if to_number.startswith("whatsapp:") else f"whatsapp:{to_number}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json"
    creds = base64.b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()
    try:
        r = httpx.post(
            url,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={"From": TWILIO_FROM, "To": to, "Body": body[:1500]},
            timeout=15,
        )
        if r.status_code in (200, 201):
            return r.json().get("sid")
        log(f"  ! Twilio HTTP {r.status_code}: {r.text[:200]}")
        return None
    except Exception as e:
        log(f"  ! Twilio exception: {e}")
        return None


# ── Router: prefer Meta, fall back to Twilio, else dry-run ────────────────
def send_whatsapp(to_number: str, body: str,
                   template_params: list[str] | None = None) -> str | None:
    """Returns the provider's message ID on success, None on failure
    (including dry-run mode when no provider is configured)."""
    if META_TOKEN and META_PHONE_NUMBER_ID:
        return _send_via_meta(to_number, body, template_params)
    if TWILIO_SID and TWILIO_TOKEN:
        return _send_via_twilio(to_number, body)
    log(f"  · No provider configured - would have sent to {to_number}: {body[:80]}...")
    return None


def configured_provider() -> str:
    if META_TOKEN and META_PHONE_NUMBER_ID:           return "meta"
    if TWILIO_SID and TWILIO_TOKEN:                   return "twilio (fallback)"
    return "none (dry-run)"


# ── Format the alert message ──────────────────────────────────────────────
def format_message(filter_name: str, listings: list[dict]) -> str:
    """Build a concise WhatsApp message - max 1500 chars, human-friendly."""
    lines = [f"🏠 BebKey: {len(listings)} new match"
             + ("es" if len(listings) > 1 else "")
             + (f" for *{filter_name}*" if filter_name else "")
             + ":\n"]
    for x in listings[:MAX_PER_FILTER]:
        city  = x.get("city") or "?"
        rooms = x.get("rooms")
        price = x.get("price")
        deal  = "rent" if x.get("deal_type") == "rent" else "sale"
        bits  = []
        if rooms: bits.append(f"{rooms:g} rm")
        if x.get("size_m2"): bits.append(f"{int(x['size_m2'])}m²")
        if price: bits.append(f"₪{int(price):,}" + ("/mo" if deal == "rent" else ""))
        url = f"https://www.bebkey.com/listing/{x['id']}"
        lines.append(f"📍 {city} - {' · '.join(bits) if bits else 'see listing'}\n{url}\n")
    if len(listings) > MAX_PER_FILTER:
        lines.append(f"...+{len(listings) - MAX_PER_FILTER} more - see all at bebkey.com/saved-searches")
    return "\n".join(lines)


# ── Match listings to filter ──────────────────────────────────────────────
def matches_filter(listing: dict, f: dict) -> bool:
    if f.get("city") and f["city"] != listing.get("city"):
        return False
    if f.get("deal_type") and f["deal_type"] != listing.get("deal_type"):
        return False
    if f.get("price_min") and (listing.get("price") or 0) < f["price_min"]:
        return False
    if f.get("price_max") and (listing.get("price") or 1e12) > f["price_max"]:
        return False
    if f.get("rooms_min") and (listing.get("rooms") or 0) < f["rooms_min"]:
        return False
    if f.get("property_type") and f["property_type"] != listing.get("property_type"):
        return False
    return True


# ── Main ──────────────────────────────────────────────────────────────────
def main() -> None:
    log("=" * 60)
    log(f"BebKey WhatsApp Saved-Search Alerts | window={WINDOW_HOURS}h")
    log(f"Provider: {configured_provider()}")
    log("=" * 60)

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)) \
                .isoformat().replace("+00:00", "Z")

    with httpx.Client(timeout=60) as client:
        # 1. Active filters with WhatsApp opt-in
        r = client.get(
            f"{REST_URL}/filters",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select": "id,name,user_id,city,deal_type,price_min,price_max,"
                          "rooms_min,property_type,whatsapp_number,last_notified_at",
                "is_active":      "eq.true",
                "notify_whatsapp": "eq.true",
                "whatsapp_number": "not.is.null",
                "limit": "500",
            },
        )
        filters = r.json() if r.status_code == 200 else []
        log(f"Active WhatsApp filters: {len(filters)}")
        if not filters:
            log("DONE - 0 alerts sent (no opted-in saved searches)")
            return

        sent_count = 0
        for f in filters:
            since = f.get("last_notified_at") or cutoff
            # Listings created in the window that pass the basic city/deal filter
            params = [
                ("select",     "id,city,price,rooms,size_m2,deal_type,property_type"),
                ("is_active",  "eq.true"),
                ("created_at", f"gte.{since}"),
                ("order",      "created_at.desc"),
                ("limit",      "50"),
            ]
            if f.get("city"):      params.append(("city", f"eq.{f['city']}"))
            if f.get("deal_type"): params.append(("deal_type", f"eq.{f['deal_type']}"))
            rr = client.get(f"{REST_URL}/listings", headers={**SB_HEADERS, "Prefer": ""},
                            params=params)
            if rr.status_code != 200:
                log(f"  ! filter {f['id']} listings query: HTTP {rr.status_code}")
                continue

            candidates = [x for x in (rr.json() or []) if matches_filter(x, f)]
            if not candidates:
                continue

            # Dedup against whatsapp_notifications log
            cand_ids = ",".join(f'"{c["id"]}"' for c in candidates)
            dedup = client.get(
                f"{REST_URL}/whatsapp_notifications",
                headers={**SB_HEADERS, "Prefer": ""},
                params={
                    "select":     "listing_id",
                    "filter_id":  f"eq.{f['id']}",
                    "listing_id": f"in.({cand_ids})",
                },
            )
            already = {row["listing_id"] for row in (dedup.json() or [])} if dedup.status_code == 200 else set()
            fresh = [c for c in candidates if c["id"] not in already]
            if not fresh:
                continue

            body = format_message(f.get("name") or "", fresh)
            sid  = send_whatsapp(f["whatsapp_number"], body)
            if sid is None and TWILIO_SID:  # Twilio configured but call failed
                continue
            if sid is None and not TWILIO_SID:
                # Dry-run mode - log but don't record
                log(f"  · (dry-run) {f['whatsapp_number']} | {len(fresh)} matches")
                sent_count += 1
                continue

            # Record each listing as delivered so we never re-send
            for c in fresh:
                client.post(
                    f"{REST_URL}/whatsapp_notifications",
                    headers=SB_HEADERS,
                    content=json.dumps({
                        "filter_id":       f["id"],
                        "listing_id":      c["id"],
                        "whatsapp_number": f["whatsapp_number"],
                        "twilio_sid":      sid,
                    }).encode("utf-8"),
                )

            # Bump filter's last_notified_at so email pipeline doesn't double-fire
            client.patch(
                f"{REST_URL}/filters",
                headers=SB_HEADERS,
                params={"id": f"eq.{f['id']}"},
                content=json.dumps({"last_notified_at": datetime.now(timezone.utc).isoformat()}).encode("utf-8"),
            )

            sent_count += 1
            log(f"  ✓ {f['whatsapp_number']} | filter '{f.get('name', '?')}' | "
                f"{len(fresh)} listings | sid={sid}")

    log("=" * 60)
    log(f"DONE - {sent_count} WhatsApp alerts sent")
    log("=" * 60)


if __name__ == "__main__":
    main()
