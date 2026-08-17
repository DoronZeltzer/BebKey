"""
BebKey - Email Alert Sender
Runs after every scraper cycle and sends two types of alerts:

1. match_alert  - agent is notified that a new listing matches one of their clients
2. saved_search_alert - buyer is notified that a new listing matches their saved search

Requires the following columns (see supabase/migrations/add_lat_lng_deal_type.sql):
  notifications.email_sent_at   (TIMESTAMPTZ, nullable)
  filters.last_notified_at      (TIMESTAMPTZ, nullable)
  filters.notify_email          (TEXT, email address to notify)
"""

import os
import sys
import json
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LOG_FILE = os.path.join(os.path.dirname(__file__), "alerts_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars")
    sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
FUNC_URL   = f"{SUPABASE_URL}/functions/v1/send-email"

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def call_send_email(client: httpx.Client, payload: dict) -> bool:
    """Call the Supabase send-email Edge Function."""
    try:
        r = client.post(
            FUNC_URL,
            headers=SB_HEADERS,
            json=payload,
            timeout=15,
        )
        if r.status_code in (200, 204):
            return True
        log(f"  send-email error {r.status_code}: {r.text[:200]}")
        return False
    except Exception as e:
        log(f"  send-email exception: {e}")
        return False


def mark_notification_sent(client: httpx.Client, notif_id: str):
    """Mark notification as emailed."""
    try:
        client.patch(
            f"{REST_URL}/notifications",
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            params={"id": f"eq.{notif_id}"},
            json={"email_sent_at": datetime.now(timezone.utc).isoformat()},
            timeout=10,
        )
    except Exception as e:
        log(f"  Mark sent error: {e}")


def send_agent_match_alerts(client: httpx.Client) -> int:
    """
    Find notifications without email_sent_at, send match_alert emails to agents.
    """
    try:
        r = client.get(
            f"{REST_URL}/notifications",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select": "id,matched_fields,agent_id,listing_id,client_id,"
                          "agent:agents(user_id,phone,agency_name,user:users(email,role)),"
                          "listing:listings(id,city,street,price,rooms,size_m2,images,deal_type,source_url),"
                          "client:agent_clients(client_name,preferred_cities,budget_max)",
                "email_sent_at": "is.null",
                "limit": "50",
                "order": "sent_at.asc",
            },
            timeout=15,
        )
        if r.status_code != 200:
            log(f"Fetch notifications error: {r.status_code}")
            return 0

        notifications = r.json()
        if not notifications:
            log("No unsent agent match notifications")
            return 0

        log(f"Sending {len(notifications)} agent match alert(s)...")
        sent = 0

        for notif in notifications:
            agent  = notif.get("agent") or {}
            user   = agent.get("user") or {}
            listing = notif.get("listing") or {}
            cl     = notif.get("client") or {}

            agent_email = user.get("email")
            if not agent_email:
                mark_notification_sent(client, notif["id"])
                continue

            payload = {
                "type": "match_alert",
                "data": {
                    "agentEmail": agent_email,
                    "agencyName": agent.get("agency_name", ""),
                    "clientName": cl.get("client_name", ""),
                    "matchedFields": notif.get("matched_fields", []),
                    "listing": {
                        "id":       listing.get("id", ""),
                        "city":     listing.get("city", ""),
                        "street":   listing.get("street", ""),
                        "price":    listing.get("price"),
                        "rooms":    listing.get("rooms"),
                        "size_m2":  listing.get("size_m2"),
                        "dealType": listing.get("deal_type", ""),
                        "sourceUrl": listing.get("source_url", ""),
                        "image":    (_first_img(listing.get("images"))),
                    },
                },
            }

            ok = call_send_email(client, payload)
            if ok:
                mark_notification_sent(client, notif["id"])
                sent += 1
                log(f"  ✓ match_alert → {agent_email} | client: {cl.get('client_name')} | {listing.get('city')}")
            else:
                log(f"  ✗ Failed for notif {notif['id']}")

        return sent

    except Exception as e:
        log(f"Agent match alerts error: {e}")
        return 0


def send_saved_search_alerts(client: httpx.Client) -> int:
    """
    For each active saved search (filter), find listings posted in the last 24h
    that match. Send saved_search_alert to the filter owner if matches found.
    Tracks last_notified_at to avoid duplicate emails.
    """
    try:
        # Fetch active filters that have a notify_email
        r = client.get(
            f"{REST_URL}/filters",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select": "id,name,city,price_min,price_max,rooms_min,property_type,deal_type,notify_email,last_notified_at",
                "is_active": "eq.true",
                "notify_email": "not.is.null",
                "limit": "100",
            },
            timeout=15,
        )
        if r.status_code != 200:
            log(f"Fetch filters error: {r.status_code}")
            return 0

        filters = r.json()
        if not filters:
            log("No active saved searches with notify_email")
            return 0

        log(f"Checking {len(filters)} saved search(es) for matches...")
        sent = 0

        for f in filters:
            # Cutoff: never re-notify about listings the user has already seen.
            # Use last_notified_at if set, else fall back to 24h ago.
            cutoff = f.get("last_notified_at") or _yesterday_iso()

            # Build query params for matching listings (using a list-of-tuples
            # form so we can pass both price.gte and price.lte simultaneously -
            # a dict would silently overwrite duplicate keys).
            params: list[tuple[str, str]] = [
                # Added neighborhood + ai_summary so the email digest can
                # include richer location context + AI's "why this fits"
                # one-liner.  ai_summary is JSON-encoded; the edge function
                # parses it client-side.
                ("select",     "id,city,neighborhood,street,price,rooms,size_m2,images,"
                               "deal_type,source_url,ai_summary"),
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

            r2 = client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params=params,
                timeout=15,
            )
            if r2.status_code != 200:
                continue

            matches = r2.json()
            if not matches:
                continue

            def _summary_one_liner(raw: str | None) -> str | None:
                """Pull a one-line gist out of the ai_summary JSON column.
                The column stores {summary_he, summary_en, pros, lifestyle_tags}.
                Prefer summary_en (since email locales aren't tracked yet);
                fall back to first 2 pros joined."""
                if not raw:
                    return None
                try:
                    s = json.loads(raw) if isinstance(raw, str) else raw
                except Exception:
                    return None
                if s.get("summary_en"):
                    return (s["summary_en"] or "").strip()[:180] or None
                if s.get("summary_he"):
                    return (s["summary_he"] or "").strip()[:180] or None
                pros = s.get("pros") or []
                if pros:
                    return " · ".join(pros[:2])[:180]
                return None

            payload = {
                "type": "saved_search_alert",
                "data": {
                    "email": f["notify_email"],
                    "searchName": f.get("name") or f.get("city") or "Saved Search",
                    "matchCount": len(matches),
                    "listings": [
                        {
                            "id":           m.get("id", ""),
                            "city":         m.get("city", ""),
                            "neighborhood": m.get("neighborhood", ""),
                            "price":        m.get("price"),
                            "rooms":        m.get("rooms"),
                            "size_m2":      m.get("size_m2"),  # used by hero-card stats in email
                            "dealType":     m.get("deal_type", ""),
                            "sourceUrl":    m.get("source_url", ""),
                            "image":        (_first_img(m.get("images"))),
                            # AI's "why this fits" gist - shown inline below
                            # the price/city row in the email template.
                            "aiSummary":    _summary_one_liner(m.get("ai_summary")),
                        }
                        for m in matches[:3]
                    ],
                },
            }

            ok = call_send_email(client, payload)
            if ok:
                # Update last_notified_at
                try:
                    client.patch(
                        f"{REST_URL}/filters",
                        headers={**SB_HEADERS, "Prefer": "return=minimal"},
                        params={"id": f"eq.{f['id']}"},
                        json={"last_notified_at": datetime.now(timezone.utc).isoformat()},
                        timeout=10,
                    )
                except Exception:
                    pass
                sent += 1
                log(f"  ✓ saved_search_alert → {f['notify_email']} | {len(matches)} matches | {f.get('city', 'any city')}")

        return sent

    except Exception as e:
        log(f"Saved search alerts error: {e}")
        return 0


def _yesterday_iso() -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()


def _first_img(images) -> str:
    """Return the first image URL safely.  Some legacy rows have non-list
    image fields (string, dict, None) so we defensively handle all cases."""
    if not images:
        return ""
    if isinstance(images, list):
        if not images:
            return ""
        first = images[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url", "") or ""
        return ""
    if isinstance(images, str):
        return images
    return ""


def main():
    log("BebKey Alert Sender starting")

    with httpx.Client() as client:
        agent_sent  = send_agent_match_alerts(client)
        search_sent = send_saved_search_alerts(client)

    log(f"DONE - {agent_sent} match alerts, {search_sent} saved search alerts sent")


if __name__ == "__main__":
    main()
