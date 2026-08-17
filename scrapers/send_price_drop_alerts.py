"""
BebKey - Price-Drop Email Alerts

Counter-feature to keyz.ai's lack of aggregation: we send price-drop
emails the moment a listing on a user's watchlist OR matching a saved
search drops 5%+.  No competitor does this across 19.5K+ listings.

How it works:
  1. Pull every row inserted into listing_price_changes within the last
     24 hours where delta < 0 (price dropped) AND drop >= 5%.
  2. For each price-dropped listing:
       a) Match against any user's saved_listings → email them.
       b) Match against any user's saved_search filters → email them.
     Dedupe so a user gets ONE email per listing per drop.
  3. Record what we sent in `price_drop_notifications(user_id, listing_id,
     old_price, new_price, sent_at)` so we never re-send on the same drop.

Designed to run after track_price_changes.py in the workflow.  Idempotent
across re-runs of the same window thanks to the dedup table.

Env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  RESEND_API_KEY            - required for actual email send (warns + no-ops if unset)
  PRICE_DROP_MIN_PCT        - default 5 (a 5% drop or larger triggers an alert)
  PRICE_DROP_WINDOW_HOURS   - default 24 (look at changes within the last 24h)
"""
import os
import sys
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "price_drop_alerts_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
RESEND_KEY   = os.getenv("RESEND_API_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

MIN_PCT       = float(os.getenv("PRICE_DROP_MIN_PCT", "5"))
WINDOW_HOURS  = int(os.getenv("PRICE_DROP_WINDOW_HOURS", "24"))
FROM_ADDR     = "BebKey <alerts@bebkey.com>"


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Fetch recent drops ─────────────────────────────────────────────────────
def fetch_recent_price_drops(client: httpx.Client) -> list[dict]:
    """Return rows from listing_price_changes within the lookback window
    where new_price < old_price by at least MIN_PCT.  Join in the listing
    so we can match against saved_searches / saved_listings."""
    since = (datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)).isoformat().replace("+00:00", "Z")
    try:
        r = client.get(
            f"{REST_URL}/listing_price_changes",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                # PostgREST embedded resource: pull the listing in one query
                "select":     "id,listing_id,old_price,new_price,delta,changed_at,"
                              "listing:listings(id,city,neighborhood,rooms,price,"
                              "deal_type,property_type,source_url,images,title)",
                "delta":      "lt.0",          # price decreased
                "changed_at": f"gte.{since}",
                "order":      "changed_at.desc",
                "limit":      "500",
            },
            timeout=30,
        )
        rows = r.json() if r.status_code == 200 else []
    except Exception as e:
        log(f"  ! fetch_recent_price_drops error: {e}")
        return []

    # Filter to drops ≥ MIN_PCT
    filtered = []
    for row in rows:
        old, new = row.get("old_price"), row.get("new_price")
        if not old or not new or new >= old:
            continue
        pct = (old - new) / old * 100
        if pct < MIN_PCT:
            continue
        row["pct_drop"] = round(pct, 1)
        filtered.append(row)
    return filtered


# ── Match against user saved listings + saved searches ─────────────────────
def fetch_users_saved_listings(client: httpx.Client, listing_ids: list[str]) -> dict[str, list[dict]]:
    """Returns { listing_id: [ {user_id, email}, ... ] }."""
    if not listing_ids:
        return {}
    quoted = ",".join(f'"{lid}"' for lid in listing_ids)
    try:
        # saved_listings + auth.users.email join
        # Note: this requires a `saved_listings` table with (user_id, listing_id)
        # and a view exposing user emails.  Adjust path/table if your schema differs.
        r = client.get(
            f"{REST_URL}/saved_listings",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select":     "listing_id,user_id,user:users(email,full_name,locale)",
                "listing_id": f"in.({quoted})",
            },
            timeout=30,
        )
        if r.status_code != 200:
            log(f"  ! saved_listings: HTTP {r.status_code}: {r.text[:120]}")
            return {}
        out: dict[str, list[dict]] = defaultdict(list)
        for row in r.json() or []:
            lid = row.get("listing_id")
            user = row.get("user") or {}
            if user.get("email"):
                out[lid].append({
                    "user_id": row.get("user_id"),
                    "email":   user["email"],
                    "name":    user.get("full_name") or user["email"].split("@")[0],
                    "locale":  user.get("locale") or "he",
                    "match":   "saved_listing",
                })
        return out
    except Exception as e:
        log(f"  ! fetch_users_saved_listings error: {e}")
        return {}


def fetch_users_saved_search_matches(client: httpx.Client, drops: list[dict]) -> dict[str, list[dict]]:
    """For each price drop, find users whose saved_searches match it.
    Returns { drop_index → [ {user_id, email, ... }, ... ] }, keyed by the
    drop's `id` (not listing_id), since a single user could have multiple
    saved searches that all match the same listing - we only want one email."""
    try:
        # Pull all saved searches in one go.  This works for a small user
        # base; switch to per-listing match queries when the saved_searches
        # table grows past a few thousand rows.
        r = client.get(
            f"{REST_URL}/saved_searches",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select": "id,user_id,city,deal_type,price_min,price_max,rooms_min,rooms_max,"
                          "user:users(email,full_name,locale)",
            },
            timeout=30,
        )
        if r.status_code != 200:
            log(f"  ! saved_searches: HTTP {r.status_code}: {r.text[:120]}")
            return {}
        searches = r.json() or []
    except Exception as e:
        log(f"  ! fetch_users_saved_search_matches error: {e}")
        return {}

    matches: dict[str, list[dict]] = defaultdict(list)
    for drop in drops:
        listing = drop.get("listing") or {}
        l_city  = listing.get("city")
        l_deal  = listing.get("deal_type")
        l_price = listing.get("price") or drop.get("new_price")
        l_rooms = listing.get("rooms")
        if l_price is None:
            continue
        for s in searches:
            user = s.get("user") or {}
            if not user.get("email"):
                continue
            # City filter
            if s.get("city") and s["city"] != l_city:
                continue
            # Deal type filter
            if s.get("deal_type") and s["deal_type"] != l_deal:
                continue
            # Price range
            if s.get("price_min") and l_price < s["price_min"]:
                continue
            if s.get("price_max") and l_price > s["price_max"]:
                continue
            # Rooms range
            if l_rooms is not None:
                if s.get("rooms_min") and l_rooms < s["rooms_min"]:
                    continue
                if s.get("rooms_max") and l_rooms > s["rooms_max"]:
                    continue
            matches[drop["id"]].append({
                "user_id":   s["user_id"],
                "email":     user["email"],
                "name":      user.get("full_name") or user["email"].split("@")[0],
                "locale":    user.get("locale") or "he",
                "match":     "saved_search",
                "search_id": s["id"],
            })
    return matches


# ── Dedupe against already-sent alerts ─────────────────────────────────────
def fetch_already_notified(client: httpx.Client, drop_ids: list[int]) -> set[tuple[str, int]]:
    """Return set of (user_id, change_id) tuples we've already emailed."""
    if not drop_ids:
        return set()
    quoted = ",".join(str(d) for d in drop_ids)
    try:
        r = client.get(
            f"{REST_URL}/price_drop_notifications",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select":           "user_id,change_id",
                "change_id":        f"in.({quoted})",
            },
            timeout=30,
        )
        if r.status_code != 200:
            return set()
        return {(row["user_id"], row["change_id"]) for row in (r.json() or [])}
    except Exception:
        return set()


def record_notification_sent(client: httpx.Client, user_id: str, change_id: int) -> None:
    try:
        client.post(
            f"{REST_URL}/price_drop_notifications",
            headers=SB_HEADERS,
            content=json.dumps({
                "user_id":  user_id,
                "change_id": change_id,
            }).encode("utf-8"),
            timeout=10,
        )
    except Exception as e:
        log(f"  ! record_notification_sent error: {e}")


# ── Email rendering ────────────────────────────────────────────────────────
def render_email(drop: dict, recipient: dict) -> tuple[str, str]:
    listing  = drop.get("listing") or {}
    old      = drop["old_price"]
    new      = drop["new_price"]
    pct      = drop["pct_drop"]
    saved    = old - new
    city     = listing.get("city") or "Israel"
    nbhd     = listing.get("neighborhood")
    rooms    = listing.get("rooms")
    typ      = listing.get("property_type") or "apartment"
    deal     = listing.get("deal_type") or "forsale"
    deal_lbl = "rent" if deal == "rent" else "sale"
    img      = (listing.get("images") or [None])[0]
    bebkey_url = f"https://www.bebkey.com/listing/{listing.get('id', drop['listing_id'])}"
    locale = recipient.get("locale", "he")

    if locale == "he":
        subj  = f"💰 ירידת מחיר: {city} - חסכון של ₪{saved:,} ({pct:g}%)"
        title = "ירידת מחיר במעקב שלך"
        cta   = "צפה במודעה"
        intro = f"{recipient.get('name', 'שלום')},"
        body  = (
            f"דירת {rooms} חדרים ב{city}" + (f", {nbhd}" if nbhd else "") +
            f" ירדה במחיר.<br><br>" +
            f"<b>היה:</b> ₪{old:,}<br><b>עכשיו:</b> ₪{new:,}<br>" +
            f"<b>חסכון:</b> <span style='color:#22c55e'>₪{saved:,} ({pct:g}%)</span>"
        )
    else:
        subj  = f"💰 Price drop: {city} - saved ₪{saved:,} ({pct:g}%)"
        title = "Price drop on a listing you're tracking"
        cta   = "View listing"
        intro = f"Hi {recipient.get('name', 'there')},"
        body  = (
            f"This {rooms or ''}-room {typ} in {city}" + (f", {nbhd}" if nbhd else "") +
            f" just dropped its asking {deal_lbl} price.<br><br>" +
            f"<b>Was:</b> ₪{old:,}<br><b>Now:</b> ₪{new:,}<br>" +
            f"<b>Saved:</b> <span style='color:#22c55e'>₪{saved:,} ({pct:g}%)</span>"
        )

    img_html = f'<img src="{img}" style="width:100%;border-radius:12px;margin:16px 0" />' if img else ''
    html = f"""
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            background:#f0f4ff;padding:24px 16px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;
              overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="background:#1A56DB;padding:16px 24px;color:#fff">
      <strong style="font-size:1rem">{title}</strong>
    </div>
    <div style="padding:24px;color:#111827;font-size:.92rem;line-height:1.55">
      <p style="margin:0 0 12px">{intro}</p>
      <p style="margin:0">{body}</p>
      {img_html}
      <a href="{bebkey_url}"
         style="display:inline-block;margin-top:8px;padding:12px 24px;background:#F59E0B;
                color:#fff;text-decoration:none;border-radius:10px;font-weight:600">
        {cta} →
      </a>
      <p style="margin:24px 0 0;font-size:.75rem;color:#9ca3af">
        BebKey · The Israeli real-estate aggregator
      </p>
    </div>
  </div>
</div>"""
    return subj, html


def send_email(subject: str, html: str, to_email: str) -> bool:
    if not RESEND_KEY:
        log(f"  · RESEND_API_KEY not set - would have sent: {subject} → {to_email}")
        return False
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_KEY}",
                     "Content-Type": "application/json"},
            json={"from": FROM_ADDR, "to": [to_email],
                  "subject": subject, "html": html},
            timeout=20,
        )
        ok = r.status_code in (200, 201)
        if not ok:
            log(f"  ! Resend HTTP {r.status_code}: {r.text[:120]}")
        return ok
    except Exception as e:
        log(f"  ! Resend exception: {e}")
        return False


# ── Main ───────────────────────────────────────────────────────────────────
def main() -> None:
    log("=" * 60)
    log(f"BebKey Price-Drop Alerts | window={WINDOW_HOURS}h | min={MIN_PCT}%")
    log("=" * 60)

    with httpx.Client(timeout=60) as client:
        drops = fetch_recent_price_drops(client)
        log(f"Found {len(drops)} price drops ≥ {MIN_PCT}% in the last {WINDOW_HOURS}h")
        if not drops:
            log("DONE - 0 alerts sent (no qualifying drops)")
            return

        listing_ids = [d["listing_id"] for d in drops if d.get("listing_id")]

        # Build per-drop list of (user_id, email, locale, name, match_kind)
        saved_listings = fetch_users_saved_listings(client, listing_ids)
        saved_searches = fetch_users_saved_search_matches(client, drops)
        already_sent   = fetch_already_notified(client, [d["id"] for d in drops])

        sent_count   = 0
        skipped_dupe = 0
        for drop in drops:
            recipients: dict[str, dict] = {}  # user_id → recipient (dedupe)
            for r in saved_listings.get(drop["listing_id"], []):
                recipients[r["user_id"]] = r
            for r in saved_searches.get(drop["id"], []):
                # Prefer saved_listing match over saved_search match (more specific)
                recipients.setdefault(r["user_id"], r)

            for user_id, rec in recipients.items():
                if (user_id, drop["id"]) in already_sent:
                    skipped_dupe += 1
                    continue
                subj, html = render_email(drop, rec)
                if send_email(subj, html, rec["email"]):
                    record_notification_sent(client, user_id, drop["id"])
                    sent_count += 1
                    listing = drop.get("listing") or {}
                    log(f"  ✓ {rec['email']} ({rec['match']}) | "
                        f"{listing.get('city', '?')} | "
                        f"₪{drop['old_price']:,} → ₪{drop['new_price']:,} "
                        f"(-{drop['pct_drop']:g}%)")

    log("=" * 60)
    log(f"DONE - {sent_count} price-drop alerts sent ({skipped_dupe} skipped as already-notified)")
    log("=" * 60)


if __name__ == "__main__":
    main()
