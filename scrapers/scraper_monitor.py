"""
BebKey - Scraper Monitor  (v2)

Runs after every scraper cycle.  Two jobs:
  1. Check the Madlan log for PerimeterX block events → email alert.
  2. Check every scraper log for a "zero-result" run → Telegram DM to admin.

Required env vars:
  RESEND_API_KEY           - Resend API key for email delivery (optional)
  TELEGRAM_BOT_TOKEN       - @bebkey_alerts_bot token (optional)
  TELEGRAM_ADMIN_CHAT_ID   - your personal Telegram chat ID (optional)

Exit codes:
  0 - no problems detected
  1 - blocks detected (GitHub Actions marks the step as failed = visible warning)
"""

import os
import sys
from datetime import datetime

import httpx

# ── Config ────────────────────────────────────────────────────────────────────
SCRAPERS_DIR  = os.path.dirname(__file__)
LOG_FILE      = os.path.join(SCRAPERS_DIR, "madlan_playwright_log.txt")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
ALERT_TO      = "doron@bebkey.com"
ALERT_FROM    = "BebKey <support@bebkey.com>"
LOG_TAIL_LINES = 50

# Telegram alert config
TG_BOT_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_ADMIN_CHAT  = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "")
TG_API_BASE    = f"https://api.telegram.org/bot{TG_BOT_TOKEN}"

# Log files to scan for zero-result detection.
# Tuple: (scraper_name, log_filename, summary_pattern, min_expected)
# summary_pattern: substring that appears on the final result line
SCRAPER_LOGS = [
    ("yad2_api",       "yad2_api_scraper_log.txt",  "DONE",    10),
    ("janglo",         "janglo_scraper_log.txt",    "DONE",     5),
    ("onmap",          "onmap_scraper_log.txt",      "DONE",     5),
    ("komo",           "komo_scraper_log.txt",       "DONE",     1),
    ("jpost",          "jpost_scraper_log.txt",      "DONE",     1),
    ("madlan",         "madlan_playwright_log.txt",  "DONE",     1),
    ("yad2_pw",        "yad2_playwright_log.txt",    "DONE",     1),
    # The next 4 sources require secrets that aren't always set in CI -
    # min_expected=0 means we skip the zero-result alert for them so the
    # admin Telegram channel doesn't get spammed every run when keys are
    # missing.  They're still in the array so the iteration treats them
    # as known sources.
    # Apify FB Marketplace scraper removed 2026-06-14; FB Groups now the
    # primary FB source.
    ("fb_groups",      "facebook_groups_log.txt",    "DONE",     0),
    ("telegram",       "telegram_scraper_log.txt",   "DONE",     0),
]


# ── Madlan block detection ────────────────────────────────────────────────────

def analyse_block_log(log_path: str) -> tuple[int, int, list[str]]:
    if not os.path.exists(log_path):
        return 0, 0, []
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    block_count           = sum(1 for l in lines if "[BLOCK_DETECTED]"   in l)
    block_rate_high_count = sum(1 for l in lines if "[BLOCK_RATE_HIGH]"  in l)
    recent_lines          = [l.rstrip() for l in lines[-LOG_TAIL_LINES:]]
    return block_count, block_rate_high_count, recent_lines


def send_block_alert_email(block_count: int, block_rate_high: int,
                           recent_lines: list[str]) -> bool:
    if not RESEND_API_KEY:
        print("[monitor] RESEND_API_KEY not set - skipping email alert")
        return False

    log_html = "<br>".join(
        l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        for l in recent_lines
    )
    rate_warn = (
        f"<p><strong>⚠️ BLOCK_RATE_HIGH fired {block_rate_high} time(s)</strong></p>"
        if block_rate_high > 0 else ""
    )
    html = f"""
<h2>🚨 Madlan scraper blocked on GitHub Actions</h2>
<p><strong>Block events:</strong> {block_count}</p>
{rate_warn}
<hr>
<pre style="background:#f4f4f4;padding:12px;font-size:12px;overflow:auto">{log_html}</pre>
<p style="color:#888;font-size:11px">Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
"""
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": ALERT_FROM, "to": [ALERT_TO],
                  "subject": f"🚨 Madlan blocked - {block_count} event(s)", "html": html},
            timeout=15,
        )
        ok = r.status_code in (200, 201)
        print(f"[monitor] Email {'sent' if ok else 'FAILED'} ({r.status_code})")
        return ok
    except Exception as e:
        print(f"[monitor] Email exception: {e}")
        return False


# ── Zero-result detection ─────────────────────────────────────────────────────

def extract_saved_count(log_path: str) -> int | None:
    """
    Read the last ~50 lines of a log file and find the count from the
    final DONE line.  All scrapers follow the convention:
        "DONE - N new <Source> listings saved"
    so we just look for that.  Falls back to other patterns if the DONE
    line is missing.

    Returns the count from the most recent DONE line, or 0 if there's
    a DONE line without a number, or None if the log doesn't exist.
    """
    if not os.path.exists(log_path):
        return None
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    import re

    # Walk tail in reverse so we pick up the MOST RECENT DONE line (in
    # case the log accumulates across runs without truncation).
    tail = lines[-50:]
    done_re = re.compile(
        r"DONE\s*[-\-:]\s*(\d+)\s+(?:new\s+)?\S+\s+listings?",
        re.IGNORECASE,
    )
    for line in reversed(tail):
        m = done_re.search(line)
        if m:
            return int(m.group(1))

    # Fallback patterns for older scrapers that don't follow the DONE
    # convention.  Lines are lowercased before matching.
    fallback_patterns = [
        r"done\s*[-\-:]\s*(\d+)",                          # DONE - N
        r"(?:saved|inserted|upserted|written)\s+(\d+)",    # saved 42
        r"(\d+)\s+(?:saved|inserted|upserted)",            # 42 saved
        r"(\d+)\s+(?:new\s+)?(?:listing|record|row|result)",  # 42 listings
    ]
    found: list[int] = []
    for line in tail:
        lower = line.lower()
        if "error" in lower or "exception" in lower or "traceback" in lower:
            continue
        for pat in fallback_patterns:
            m = re.search(pat, lower)
            if m:
                found.append(int(m.group(1)))
    return max(found) if found else 0


def check_zero_results() -> list[str]:
    """Return list of scraper names that appear to have saved 0 listings."""
    zeros: list[str] = []
    for name, log_file, _pattern, min_exp in SCRAPER_LOGS:
        log_path = os.path.join(SCRAPERS_DIR, log_file)
        count = extract_saved_count(log_path)
        if count is None:
            # log doesn't exist → scraper was skipped or not yet run; ignore
            continue
        print(f"[monitor] {name}: ~{count} listings saved (min expected: {min_exp})")
        if count < min_exp:
            zeros.append(f"{name} (saved ~{count}, expected ≥{min_exp})")
    return zeros


def send_telegram_alert(message: str) -> bool:
    if not TG_BOT_TOKEN or not TG_ADMIN_CHAT:
        print("[monitor] Telegram admin config missing - skipping TG alert")
        return False
    try:
        r = httpx.post(
            f"{TG_API_BASE}/sendMessage",
            json={
                "chat_id":    TG_ADMIN_CHAT,
                "text":       message[:4000],
                "parse_mode": "Markdown",
            },
            timeout=10,
        )
        ok = r.status_code == 200
        print(f"[monitor] Telegram alert {'sent' if ok else 'FAILED'} ({r.status_code})")
        return ok
    except Exception as e:
        print(f"[monitor] Telegram exception: {e}")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def check_db_growth_last_24h(min_expected: int = 50) -> tuple[int, bool]:
    """Query Supabase for net new active listings added in the last 24h.
    Returns (count, is_healthy).  Catches silent regressions where every
    individual scraper exits 'success' but no actual new rows landed."""
    url     = os.getenv("VITE_SUPABASE_URL", "")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not service:
        print("[monitor] Supabase creds missing - skipping DB growth check")
        return -1, True
    try:
        from datetime import timedelta
        since = (datetime.utcnow() - timedelta(hours=24)).isoformat() + "Z"
        r = httpx.get(
            f"{url}/rest/v1/listings",
            params={"select": "id", "created_at": f"gte.{since}"},
            headers={
                "apikey": service,
                "Authorization": f"Bearer {service}",
                "Prefer": "count=exact",
                "Range": "0-0",  # we only need the Content-Range count, not rows
            },
            timeout=15,
        )
        # PostgREST returns count via "Content-Range: 0-0/<total>"
        cr = r.headers.get("content-range", "*/0")
        total = int(cr.split("/")[-1])
        return total, total >= min_expected
    except Exception as e:
        print(f"[monitor] DB growth check failed: {e}")
        return -1, True  # fail open - don't false-alarm on a transient error


def main():
    ts   = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    exit_code = 0

    # ── 1. Madlan block check ────────────────────────────────────────────────
    print(f"[monitor] Checking Madlan block log: {LOG_FILE}")
    blocks, rate_high, recent = analyse_block_log(LOG_FILE)
    print(f"[monitor] [BLOCK_DETECTED]: {blocks}  [BLOCK_RATE_HIGH]: {rate_high}")

    if blocks > 0 or rate_high > 0:
        send_block_alert_email(blocks, rate_high, recent)
        send_telegram_alert(
            f"🚨 *BebKey Madlan scraper blocked*\n"
            f"Block events: {blocks}, rate-high: {rate_high}\n"
            f"_{ts}_"
        )
        exit_code = 1

    # ── 2. Zero-result check ─────────────────────────────────────────────────
    print("[monitor] Checking scrapers for zero-result runs...")
    zeros = check_zero_results()

    if zeros:
        msg = (
            f"⚠️ *BebKey scraper zero-result alert*\n"
            f"The following scrapers saved fewer listings than expected:\n\n"
            + "\n".join(f"• {z}" for z in zeros)
            + f"\n\n_{ts}_"
        )
        print(f"[monitor] Zero-result scrapers: {zeros}")
        send_telegram_alert(msg)
        if exit_code == 0:
            exit_code = 1
    else:
        print("[monitor] All scrapers look healthy ✓")

    # ── 3. DB growth check ──────────────────────────────────────────────────
    # Catches the case where every scraper logs DONE with non-zero counts but
    # the rows were all dedup-rejected upserts (a silent staleness regression
    # we can't see from per-scraper logs alone).
    print("[monitor] Checking DB growth over the last 24h...")
    new_rows, healthy = check_db_growth_last_24h(min_expected=50)
    print(f"[monitor] new active listings (created_at within 24h): {new_rows}")
    if not healthy and new_rows >= 0:
        send_telegram_alert(
            f"🚨 *BebKey: DB row growth stalled*\n"
            f"Only *{new_rows}* new listings in the last 24h (expected ≥ 50).\n"
            f"Either every scraper is silently hitting bot blocks, or rows\n"
            f"are being upsert-rejected.  Investigate run logs.\n"
            f"_{ts}_"
        )
        if exit_code == 0:
            exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
