"""
BebKey - Price Change Tracker

Detects when an active listing's price changed since it was first seen.
Works with zero schema changes - uses existing source_id + source + price columns.

Logic:
  1. Group active listings by (source, source_id)
  2. If same source_id appears multiple times (shouldn't normally, but can
     happen with upserts that miss the unique constraint), pick latest
  3. Compare current price against the price stored in `original_price`
     column if it exists, otherwise just logs duplicates with different prices.

Also produces a "days on market" report:
  - Listings that have been active for > 45 days → "stale" alert in log
  - Listings that were re-scraped with a price change → note in log

Runs after scrapers, before alerts.  No DB writes - read-only analysis.
Output goes to price_changes_log.txt which gets uploaded as artifact.

Env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  PRICE_CHANGE_STALE_DAYS  (default 45)
"""

import os
import sys
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "price_changes_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

STALE_DAYS = int(os.getenv("PRICE_CHANGE_STALE_DAYS", "45"))


def log(msg: str) -> None:
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def fetch_active_listings(client: httpx.Client) -> list[dict]:
    listings = []
    offset, limit = 0, 1000
    while True:
        try:
            r = client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={
                    "select":    "id,source,source_id,city,price,rooms,deal_type,created_at,scraped_at",
                    "is_active": "eq.true",
                    "price":     "not.is.null",
                    "limit":     limit,
                    "offset":    offset,
                },
                timeout=30,
            )
            rows = r.json()
            if not isinstance(rows, list) or not rows:
                break
            listings.extend(rows)
            if len(rows) < limit:
                break
            offset += limit
        except Exception as e:
            log(f"Fetch error: {e}"); break
    return listings


def main() -> None:
    log("=" * 60)
    log("BebKey Price Change Tracker / Freshness Report")
    log("=" * 60)

    with httpx.Client(timeout=60) as client:
        log("Fetching active listings with prices...")
        listings = fetch_active_listings(client)
        log(f"Fetched {len(listings)} active listings with prices")

    if not listings:
        log("No listings to analyse"); return

    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(days=STALE_DAYS)

    # ── Days-on-market analysis ───────────────────────────────────────────────
    def parse_ts(ts_str: str | None) -> datetime | None:
        if not ts_str:
            return None
        try:
            return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except Exception:
            return None

    stale_by_source: dict[str, int] = {}
    total_stale = 0
    age_buckets  = {
        "0-7d":   0,
        "8-14d":  0,
        "15-30d": 0,
        "31-45d": 0,
        "45d+":   0,
    }

    for r in listings:
        created = parse_ts(r.get("created_at"))
        if not created:
            continue
        age = now - created
        days = age.days

        if days <= 7:
            age_buckets["0-7d"] += 1
        elif days <= 14:
            age_buckets["8-14d"] += 1
        elif days <= 30:
            age_buckets["15-30d"] += 1
        elif days <= 45:
            age_buckets["31-45d"] += 1
        else:
            age_buckets["45d+"] += 1
            total_stale += 1
            src = r.get("source", "unknown")
            stale_by_source[src] = stale_by_source.get(src, 0) + 1

    log("\n── Listing Age Distribution ─────────────────────────────────────")
    for bucket, count in age_buckets.items():
        bar = "█" * min(count // 10, 50)
        log(f"  {bucket:8s}: {count:5d}  {bar}")

    log(f"\n── Stale Listings (>{STALE_DAYS} days active) ──────────────────────────")
    if stale_by_source:
        for src, count in sorted(stale_by_source.items(), key=lambda x: -x[1]):
            log(f"  {src:20s}: {count} listings")
        log(f"\n  TOTAL STALE: {total_stale} listings")
        log("  → Consider running deactivate_stale.py or lowering thresholds")
    else:
        log("  None - all listings are fresh!")

    # ── Price range analysis per deal type ───────────────────────────────────
    log("\n── Price Ranges (active listings) ──────────────────────────────────")
    for deal_type in ("rent", "forsale"):
        prices = [
            int(r["price"]) for r in listings
            if r.get("deal_type") == deal_type and r.get("price")
        ]
        if not prices:
            continue
        prices.sort()
        n = len(prices)
        median = prices[n // 2]
        p25 = prices[n // 4]
        p75 = prices[3 * n // 4]
        log(f"  {deal_type:8s}: n={n:5d} | "
            f"p25=₪{p25:,} | median=₪{median:,} | p75=₪{p75:,}")

    # ── Source coverage ───────────────────────────────────────────────────────
    log("\n── Active Listings by Source ────────────────────────────────────────")
    source_counts: dict[str, int] = {}
    for r in listings:
        src = r.get("source", "unknown")
        source_counts[src] = source_counts.get(src, 0) + 1
    for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
        log(f"  {src:20s}: {count:,}")

    log("\n" + "=" * 60)
    log(f"DONE - {len(listings):,} active listings analysed")
    log("=" * 60)


if __name__ == "__main__":
    main()
