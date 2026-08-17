"""
BebKey - Open House date extractor

Parses listing descriptions for upcoming open-house events
(""בית פתוח"", "open house") and writes the parsed timestamp +
original note line to listings.open_house_at / open_house_note.

How it works:
  1. Pull listings.is_active = true AND open_house_at IS NULL where
     description ILIKES one of the open-house markers (single SQL call).
  2. For each match, find a date+time fragment within ~120 chars of
     the marker and parse it to a TZ-aware datetime in Asia/Jerusalem.
  3. Only keep events in the FUTURE (skip past or unparsable ones).
  4. UPSERT the timestamp + a short human note.

Idempotent: a listing that already has open_house_at set is skipped.
A listing whose event has passed is cleared by daily_cleanup() so the
column doesn't pile up stale rows.

Env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Designed to run in the scraper workflow after the new listings are
inserted, ~once per scraper cycle.
"""
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

# Asia/Jerusalem TZ - prefer zoneinfo (proper DST handling) but fall back
# to a static UTC+3 offset if tzdata isn't installed (e.g. bare Windows).
try:
    from zoneinfo import ZoneInfo
    _TZ_PROVIDER = ZoneInfo("Asia/Jerusalem")
except Exception:
    _TZ_PROVIDER = timezone(timedelta(hours=3))  # Israel summer time, good enough for date math

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "open_house_extract_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

TZ = _TZ_PROVIDER

# Markers that indicate an open-house mention.  Matching is ILIKE, so
# any of these (case-insensitive substring) triggers the extractor.
MARKERS_HE = ["בית פתוח", "יום פתוח", "ערב פתוח"]
MARKERS_EN = ["open house", "open day", "open day:"]

HEBREW_WEEKDAYS = {
    "ראשון": 6,
    "שני":   0,
    "שלישי": 1,
    "רביעי": 2,
    "חמישי": 3,
    "שישי":  4,
    "שבת":   5,
}
ENGLISH_WEEKDAYS = {
    "sunday":    6,
    "monday":    0,
    "tuesday":   1,
    "wednesday": 2,
    "thursday":  3,
    "friday":    4,
    "saturday":  5,
}
HEBREW_MONTHS = {
    "ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
    "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
}
ENGLISH_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
    "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def next_weekday(weekday: int, now: datetime) -> datetime:
    """Date of the next occurrence of `weekday` (0=Mon, 6=Sun) at >= now."""
    days_ahead = (weekday - now.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7   # if today is the weekday but the time hasn't been parsed yet, push to next week
    return now + timedelta(days=days_ahead)


def parse_time_token(token: str) -> tuple[int, int] | None:
    """Parse '10:00', '17:30', '10am', '5pm' → (hour, minute).
    NOTE: deliberately does NOT accept '.' as a separator - that would
    collide with DD.MM date notation common in Israel."""
    token = token.strip().lower()
    # '10am' / '5pm'
    m = re.match(r"^(\d{1,2})\s*(am|pm)$", token)
    if m:
        h = int(m.group(1))
        if m.group(2) == "pm" and h < 12: h += 12
        if m.group(2) == "am" and h == 12: h = 0
        return (h, 0)
    # '10:00' / '17:30' / '5:00pm' (colon only)
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(am|pm)?$", token)
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
        if m.group(3) == "pm" and h < 12: h += 12
        if m.group(3) == "am" and h == 12: h = 0
        if 0 <= h <= 23 and 0 <= mn <= 59:
            return (h, mn)
    return None


def extract_open_house(text: str, now: datetime | None = None) -> tuple[datetime, str] | None:
    """
    Find the first open-house mention in `text` and parse a datetime + a
    short note.  Returns (when, original_phrase) or None if not parseable.
    """
    if not text:
        return None
    now = now or datetime.now(TZ)

    lower = text.lower()
    marker_idx = -1
    for m in MARKERS_HE + MARKERS_EN:
        idx = lower.find(m.lower())
        if idx >= 0 and (marker_idx < 0 or idx < marker_idx):
            marker_idx = idx
    if marker_idx < 0:
        return None

    # Look at a window around the marker for date+time fragments
    window_start = max(0, marker_idx - 30)
    window_end   = min(len(text), marker_idx + 200)
    window = text[window_start:window_end]
    win_lower = window.lower()

    # Try to find a weekday (Hebrew or English)
    weekday_match: int | None = None
    for name, idx in HEBREW_WEEKDAYS.items():
        if f"יום {name}" in window or f"יום ה{name}" in window or name in window:
            weekday_match = idx
            break
    if weekday_match is None:
        for name, idx in ENGLISH_WEEKDAYS.items():
            if name in win_lower:
                weekday_match = idx
                break

    # Try to find a time.  Colon-only for HH:MM to avoid collision with DD.MM.
    time_match: tuple[int, int] | None = None
    time_pattern = re.compile(r"(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)", re.IGNORECASE)
    for m in time_pattern.finditer(window):
        full = m.group(0)
        parsed = parse_time_token(full)
        if parsed:
            time_match = parsed
            break

    # Try to find an explicit DD/MM or DD.MM
    date_match: tuple[int, int] | None = None  # (day, month)
    md = re.search(r"\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b", window)
    if md:
        d, mo = int(md.group(1)), int(md.group(2))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            date_match = (d, mo)

    # Try Hebrew/English month name → day
    if not date_match:
        for name, mo in HEBREW_MONTHS.items():
            mm = re.search(rf"\b(\d{{1,2}})\s+(?:ב)?{name}\b", window)
            if mm:
                date_match = (int(mm.group(1)), mo)
                break
        if not date_match:
            for name, mo in ENGLISH_MONTHS.items():
                mm = re.search(rf"\b{name}\s+(\d{{1,2}})\b", win_lower) or re.search(rf"\b(\d{{1,2}})\s+{name}\b", win_lower)
                if mm:
                    date_match = (int(mm.group(1)), mo)
                    break

    if not weekday_match and not date_match:
        return None
    if not time_match:
        # Without a time we can't be precise; default to 11:00 (mid-morning open house)
        time_match = (11, 0)

    # Build the datetime
    h, mn = time_match
    if date_match:
        d, mo = date_match
        year = now.year
        try:
            when = datetime(year, mo, d, h, mn, tzinfo=TZ)
            if when < now - timedelta(hours=2):
                # Probably refers to next year
                when = datetime(year + 1, mo, d, h, mn, tzinfo=TZ)
        except ValueError:
            return None
    else:
        # weekday-based: next occurrence of that day
        base = next_weekday(weekday_match, now)  # type: ignore[arg-type]
        when = datetime(base.year, base.month, base.day, h, mn, tzinfo=TZ)

    # Reject events too far in the future (> 60 days) — likely a misparse
    if when > now + timedelta(days=60):
        return None
    # Reject past events
    if when < now - timedelta(hours=2):
        return None

    # Pull out the original phrase as a human-readable note (~80 chars around marker)
    note_start = max(0, marker_idx - 10)
    note_end   = min(len(text), marker_idx + 80)
    note = text[note_start:note_end].strip().replace("\n", " ")[:160]

    return (when, note)


def fetch_candidates(client: httpx.Client, limit: int = 500) -> list[dict]:
    """Pull active listings missing open_house_at whose description mentions a marker."""
    # PostgREST: OR of 6 ILIKEs via .or() URL param
    or_clauses = [f"description.ilike.*{m}*" for m in MARKERS_HE + MARKERS_EN]
    params = {
        "select": "id,description,city,deal_type",
        "is_active": "eq.true",
        "open_house_at": "is.null",
        "description": "not.is.null",
        "or": f"({','.join(or_clauses)})",
        "limit": str(limit),
        "order": "scraped_at.desc",
    }
    r = client.get(f"{REST_URL}/listings", headers=SB_HEADERS, params=params, timeout=30)
    if r.status_code != 200:
        log(f"Fetch candidates error {r.status_code}: {r.text[:200]}")
        return []
    return r.json()


def update_listing(client: httpx.Client, lid: str, when: datetime, note: str) -> bool:
    payload = {
        "open_house_at":   when.astimezone(timezone.utc).isoformat(),
        "open_house_note": note,
    }
    r = client.patch(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{lid}"},
        json=payload,
        timeout=10,
    )
    return r.status_code in (200, 204)


def clear_past_events(client: httpx.Client) -> int:
    """One-off cleanup: set open_house_at = null for events that have passed."""
    cutoff = (datetime.now(TZ) - timedelta(hours=2)).astimezone(timezone.utc).isoformat()
    r = client.patch(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": "return=representation,count=exact"},
        params={"open_house_at": f"lt.{cutoff}"},
        json={"open_house_at": None, "open_house_note": None},
        timeout=30,
    )
    if r.status_code in (200, 204):
        try:
            count = int(r.headers.get("content-range", "0/0").split("/")[-1])
            return count
        except Exception:
            return 0
    log(f"Cleanup error {r.status_code}: {r.text[:200]}")
    return 0


def main():
    log("BebKey Open House extractor starting")
    with httpx.Client() as client:
        cleared = clear_past_events(client)
        if cleared:
            log(f"Cleared {cleared} past open-house events")

        candidates = fetch_candidates(client)
        log(f"Found {len(candidates)} candidate listings to scan")

        parsed = 0
        for lst in candidates:
            res = extract_open_house(lst.get("description") or "")
            if not res:
                continue
            when, note = res
            ok = update_listing(client, lst["id"], when, note)
            if ok:
                parsed += 1
                if parsed <= 10:
                    log(f"  + {lst.get('city', '?')} | {when.isoformat()} | {note[:60]}")

        log(f"DONE - {parsed} open-house events extracted")


if __name__ == "__main__":
    main()
