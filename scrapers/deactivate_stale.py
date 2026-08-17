"""
BebKey - Deactivate Stale Listings

Runs AFTER all scrapers finish. Checks source URLs of active listings that
haven't been seen recently (scraped_at older than threshold). Marks them
is_active = false when the URL is dead (404 or redirects to homepage).

Thresholds:
  - janglo, onmap : 4 / 4 days  (full-coverage scrapers)
  - yad2, madlan            : 14 days           (partial-coverage scrapers)
  - facebook                : 21 days           (partial-coverage scraper)
"""

import asyncio
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "deactivate_stale_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Thresholds per source (days since last scraped_at).  Tightened 2026-06
# after user reports of clicking through to 404'd listings.  The
# click-through validator at /api/source-redirect catches dead links
# at click-time, but this cron sweep is the proactive defense.
SOURCE_THRESHOLDS = {
    # Full-coverage scrapers (see every listing every run) - 2 days
    "janglo":          2,
    "onmap":           2,
    "komo":            2,
    "jpost":           2,
    # Partial-coverage scrapers (city-by-city, may miss some listings on
    # any given run - give more grace before deactivating)
    "yad2":            7,
    "madlan":          7,
    "telegram":        14,
    "facebook_groups": 21,
    "facebook":        21,
}

# Rate-limiting
CONCURRENCY   = 3
SLEEP_BETWEEN = 0.5   # seconds between batches
REQUEST_TIMEOUT = 5   # seconds per HEAD request
PATCH_BATCH_SIZE = 200

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BebKeyBot/1.0; +https://bebkey.com)",
    "Accept": "text/html,application/xhtml+xml",
}


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Homepage-redirect detection ───────────────────────────────────────────────

def is_homepage_redirect(final_url: str, source: str) -> bool:
    """Return True if the final URL looks like a site homepage (not a listing)."""
    u = final_url.rstrip("/")
    parsed = urllib.parse.urlparse(u)
    path   = parsed.path.rstrip("/")

    if source == "yad2":
        # Live listing: yad2.co.il/item/XXXXXXXX
        # Dead:         yad2.co.il  or  yad2.co.il/?...
        return not re.search(r"/item/", u)

    elif source == "madlan":
        # Live listing: madlan.co.il/.../<slug>
        # Dead:         madlan.co.il  or  madlan.co.il/...  (no listing slug)
        # Treat as dead if path has fewer than 2 meaningful segments
        segments = [s for s in path.split("/") if s]
        return len(segments) < 2

    elif source == "janglo":
        # Live listing: janglo.net/item/{id}
        return "/item/" not in u

    elif source == "onmap":
        # Live listing: onmap.co.il/en/home-details/...
        return "/home-details/" not in u and "/en/home-details/" not in u

    elif source == "facebook":
        # Facebook Marketplace listings: /marketplace/item/{id}
        return "/marketplace/item/" not in u

    elif source == "facebook_groups":
        # Facebook group post permalinks
        return "/posts/" not in u and "/permalink/" not in u

    elif source == "jpost":
        # JPost listings: /estate_property/{city}/{slug}/
        return "/estate_property/" not in u

    elif source == "komo":
        # komo: https://www.komo.co.il/code/nadlan/details/?modaaNum=12345
        return "modaaNum=" not in u and "adid=" not in u

    elif source == "telegram":
        # Telegram posts: t.me/{channel}/{message_id}
        return not re.search(r't\.me/.+/\d+', u)

    return False


def is_dead(status_code: int, final_url: str, original_url: str, source: str) -> bool:
    if status_code == 404:
        return True
    if status_code == 200:
        # Check if we were silently redirected to a homepage
        if final_url != original_url and is_homepage_redirect(final_url, source):
            return True
    return False


# ── Supabase helpers ──────────────────────────────────────────────────────────

async def fetch_stale_listings(
    sb_client: httpx.AsyncClient, source: str, threshold_days: int
) -> list[dict]:
    """Fetch active listings for this source where scraped_at is older than threshold."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=threshold_days)).isoformat()
    listings = []
    offset, limit = 0, 1000
    while True:
        try:
            r = await sb_client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={
                    "select":     "id,source_url",
                    "source":     f"eq.{source}",
                    "is_active":  "eq.true",
                    "scraped_at": f"lt.{cutoff}",
                    "limit":      limit,
                    "offset":     offset,
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
            log(f"  Fetch error ({source}): {e}")
            break
    return listings


async def patch_inactive(sb_client: httpx.AsyncClient, ids: list[int]) -> int:
    """Batch PATCH is_active=false for the given listing IDs. Returns count patched."""
    deactivated = 0
    for i in range(0, len(ids), PATCH_BATCH_SIZE):
        batch = ids[i : i + PATCH_BATCH_SIZE]
        id_csv = ",".join(str(x) for x in batch)
        try:
            r = await sb_client.patch(
                f"{REST_URL}/listings",
                headers=SB_HEADERS,
                params={"id": f"in.({id_csv})"},
                content=json.dumps({"is_active": False}),
                timeout=30,
            )
            if r.status_code in (200, 204):
                deactivated += len(batch)
                log(f"  Deactivated batch of {len(batch)} (IDs {batch[0]}...{batch[-1]})")
            else:
                log(f"  PATCH error {r.status_code}: {r.text[:120]}")
        except Exception as e:
            log(f"  PATCH exception: {e}")
    return deactivated


# ── URL checking ──────────────────────────────────────────────────────────────

async def check_urls(
    listings: list[dict], source: str
) -> list[int]:
    """HEAD-check each listing URL; return list of IDs confirmed dead."""
    sem        = asyncio.Semaphore(CONCURRENCY)
    dead_ids: list[int] = []

    async def check_one(listing: dict):
        url = listing["source_url"]
        async with sem:
            try:
                async with httpx.AsyncClient(
                    headers=HEADERS,
                    follow_redirects=True,
                    timeout=REQUEST_TIMEOUT,
                ) as client:
                    r = await client.head(url)
                    final = str(r.url)
                    if is_dead(r.status_code, final, url, source):
                        dead_ids.append(listing["id"])
                        log(f"  DEAD [{r.status_code}] {url} -> {final}")
            except httpx.TimeoutException:
                log(f"  TIMEOUT {url} - skipping (not marking dead)")
            except Exception as e:
                log(f"  Error checking {url}: {e}")

    # Process in batches with a sleep between them to be polite
    batch_size = CONCURRENCY
    tasks = [check_one(l) for l in listings]
    for i in range(0, len(tasks), batch_size):
        await asyncio.gather(*tasks[i : i + batch_size])
        if i + batch_size < len(tasks):
            await asyncio.sleep(SLEEP_BETWEEN)

    return dead_ids


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    log("=== deactivate_stale.py starting ===")

    total_checked    = 0
    total_deactivated = 0

    async with httpx.AsyncClient(timeout=30) as sb_client:
        for source, threshold_days in SOURCE_THRESHOLDS.items():
            log(f"Source: {source} (threshold={threshold_days}d)")
            listings = await fetch_stale_listings(sb_client, source, threshold_days)
            if not listings:
                log(f"  No stale listings for {source}")
                continue

            log(f"  {len(listings)} stale candidates to check")
            total_checked += len(listings)

            dead_ids = await check_urls(listings, source)
            log(f"  {len(dead_ids)} confirmed dead for {source}")

            if dead_ids:
                n = await patch_inactive(sb_client, dead_ids)
                total_deactivated += n

    summary = (
        f"=== DONE: Checked {total_checked} listings, "
        f"deactivated {total_deactivated} ==="
    )
    log(summary)


if __name__ == "__main__":
    asyncio.run(main())
