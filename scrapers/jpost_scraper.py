"""
BebKey - Jerusalem Post Real Estate Scraper

Targets the Anglo/expat segment: English-language listings on
realestate.jpost.com, mostly Jerusalem, Tel Aviv, Netanya.
Server-rendered HTML - no browser needed.

URL patterns:
  https://realestate.jpost.com/property_action_category/rentals/?page=N
  https://realestate.jpost.com/property_action_category/sales/?page=N
  Detail: /estate_property/{city}/{slug}/

Env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  JPOST_MAX_PAGES    (default 10)
  JPOST_CONCURRENCY  (default 3)
"""

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from quality import enrich
from monitoring import init_sentry
from scraper_utils import get_with_retry, default_browser_headers, CircuitBreaker

init_sentry("jpost")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "jpost_scraper_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}

BASE_URL    = "https://realestate.jpost.com"
CATEGORIES  = [
    ("rent",    "/property_action_category/rentals/"),
    ("forsale", "/property_action_category/sales/"),
]
MAX_PAGES   = int(os.getenv("JPOST_MAX_PAGES",   "10"))
CONCURRENCY = int(os.getenv("JPOST_CONCURRENCY", "3"))

# JPost is English-only.
HEADERS = default_browser_headers(
    referer="https://realestate.jpost.com/",
    accept_language="en-US,en;q=0.9",
)

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# ── Supabase ──────────────────────────────────────────────────────────────────
# IMPORTANT: Supabase rejects service-role keys sent from "browser-looking"
# requests with `Forbidden use of secret API key in browser`.  Since our site
# client carries a Chrome User-Agent + sec-ch-ua + Sec-Fetch-* headers, we
# must NOT reuse it for Supabase calls - every Supabase REST call goes
# through a fresh httpx.AsyncClient that has only the default Python UA.
# The `client` parameter below is kept for backward-compat but unused.
async def preload_existing_urls(client: httpx.AsyncClient) -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{REST_URL}/listings",
                    headers={**SB_HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.jpost",
                            "is_active": "eq.true",
                            "limit": limit, "offset": offset},
                )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                for row in rows:
                    existing.add(row["source_url"])
                if len(rows) < limit:
                    break
                offset += limit
            except Exception as e:
                log(f"Preload error: {e}"); break
    log(f"Preloaded {len(existing)} existing JPost URLs")
    return existing


async def upsert_batch(client: httpx.AsyncClient, rows: list[dict]) -> int:
    if not rows:
        return 0
    for row in rows:
        enrich(row)
    try:
        async with httpx.AsyncClient(timeout=30) as sb:
            r = await sb.post(
                f"{REST_URL}/listings?on_conflict=source_url",
                headers=SB_HEADERS,
                content=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
            )
        if r.status_code in (200, 201):
            return len(rows)
        log(f"  ⚠ Supabase {r.status_code}: {r.text[:200]}")
        return 0
    except Exception as e:
        log(f"  ⚠ upsert error: {e}")
        return 0

# ── Parse listing detail page ─────────────────────────────────────────────────
PRICE_RE = re.compile(r'₪\s*([\d,]+)|(\d[\d,]+)\s*(?:₪|NIS|ILS|\$)')
ROOMS_RE = re.compile(r'(\d+(?:\.\d)?)\s*(?:rooms?|bed)', re.I)
SIZE_RE  = re.compile(r'(\d+)\s*(?:sq\.?\s*m|sqm|m²|מ"ר)', re.I)
FLOOR_RE = re.compile(r'floor\s*:?\s*(\d+|ground)', re.I)


def _parse_price(text: str) -> int | None:
    m = PRICE_RE.search(text)
    if not m:
        return None
    raw = (m.group(1) or m.group(2) or "").replace(",", "").replace(" ", "")
    try:
        v = int(raw)
        return v if 100 < v < 100_000_000 else None
    except ValueError:
        return None


def parse_card(card, deal_type: str) -> dict | None:
    """
    Extract a listing from a JPost index-page card.

    Observed HTML structure (2025):
      <div class="listing_wrapper ...">
        data-modal-link="https://realestate.jpost.com/estate_property/city/slug/"
        <div class="listing_unit_price_wrapper">₪ 22,000</div>
        <h4><a href="...">Title</a></h4>
        <span class="property_details_type1_rooms">
          <span class="property_details_type1_value">8</span> Rooms
        </span>
    """
    # Source URL - prefer data-modal-link, fall back to first estate_property href
    source_url = card.get("data-modal-link", "")
    if not source_url:
        link = card.select_one("a[href*='/estate_property/']")
        source_url = link.get("href", "") if link else ""
    if not source_url or "estate_property" not in source_url:
        return None
    source_url = source_url.rstrip("/") + "/"

    # Source ID from URL slug (last non-empty segment)
    parts     = [p for p in source_url.split("/") if p]
    source_id = parts[-1] if parts else None

    # Price - dedicated price div first, then full-text fallback
    price = None
    price_el = card.select_one(".listing_unit_price_wrapper, .price_label, [class*='price']")
    if price_el:
        price = _parse_price(price_el.get_text(" ", strip=True))
    if not price:
        price = _parse_price(card.get_text(" ", strip=True))

    # Rooms - JPost uses "8 Rooms" in a dedicated span
    rooms = None
    rooms_val = card.select_one(".property_details_type1_value")
    if rooms_val:
        try:
            rooms = float(rooms_val.get_text(strip=True))
        except ValueError:
            pass
    if rooms is None:
        m = ROOMS_RE.search(card.get_text(" ", strip=True))
        if m:
            try: rooms = float(m.group(1))
            except ValueError: pass

    # Size
    size_m2 = None
    m = SIZE_RE.search(card.get_text(" ", strip=True))
    if m:
        try: size_m2 = float(m.group(1))
        except ValueError: pass

    # Floor
    floor = None
    m = FLOOR_RE.search(card.get_text(" ", strip=True))
    if m:
        fraw = m.group(1)
        floor = 0 if fraw.lower() == "ground" else (int(fraw) if fraw.isdigit() else None)

    # City - from URL path segment after /estate_property/
    city = None
    try:
        idx = source_url.split("/").index("estate_property")
        city_slug = source_url.split("/")[idx + 1]
        city = city_slug.replace("-", " ").title()
    except (ValueError, IndexError):
        pass

    # Title - JPost uses <h4> not <h2>/<h3>
    title_el = card.select_one("h4, h3, h2, .property-title, .listing-title")
    title    = title_el.get_text(strip=True) if title_el else None

    # Images
    images = []
    # data-main-modal attribute holds the primary image URL
    main_img = card.get("data-main-modal", "")
    if main_img and any(ext in main_img.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")):
        images.append(main_img)
    for img in card.select("img"):
        src = img.get("src") or img.get("data-src") or ""
        if src and "http" in src and not any(
            x in src.lower() for x in ("logo", "icon", "avatar", "placeholder")
        ) and src not in images:
            images.append(src)
    images = images[:5]

    if not price and rooms is None and not images:
        return None

    return {
        "source":      "jpost",
        "source_id":   source_id,
        "source_url":  source_url,
        "deal_type":   deal_type,
        "price":       price,
        "city":        city,
        "rooms":       rooms,
        "size_m2":     size_m2,
        "floor":       floor,
        "description": title,
        "images":      images,
        "is_active":   True,
        "scraped_at":  datetime.now(timezone.utc).isoformat(),
    }


# ── Scrape one category ───────────────────────────────────────────────────────
async def scrape_category(
    client: httpx.AsyncClient,
    existing: set[str],
    deal_type: str,
    path: str,
) -> int:
    saved = 0
    batch = []
    consecutive_empty = 0
    # Trip after 5 consecutive fetch errors so we don't grind 10 pages × 3
    # retries × 20s if jpost is having a bad day.
    breaker = CircuitBreaker(threshold=5, name=f"jpost/{deal_type}")

    for page_num in range(1, MAX_PAGES + 1):
        if breaker.tripped:
            log(breaker.trip_message())
            break
        url = f"{BASE_URL}{path}" + (f"?page={page_num}" if page_num > 1 else "")
        try:
            r = await get_with_retry(client, url, log, timeout=15)
        except Exception as e:
            log(f"  [{deal_type}] p{page_num} error: {e}")
            breaker.record_failure()
            continue

        if r.status_code != 200:
            log(f"  [{deal_type}] p{page_num} HTTP {r.status_code} - stopping")
            break
        breaker.record_success()

        soup  = BeautifulSoup(r.text, "lxml")
        # JPost uses div.listing_wrapper for each property card (confirmed 2025).
        # Fallback: find any div/article that contains an estate_property link.
        cards = soup.select("div.listing_wrapper")
        if not cards:
            cards = [
                c for c in soup.select("div, article, li")
                if c.select_one("a[href*='estate_property']")
                and c.get("data-modal-link", "").startswith("http")
            ]

        if not cards:
            consecutive_empty += 1
            if consecutive_empty >= 2:
                log(f"  [{deal_type}] p{page_num} no cards × 2 - stopping")
                break
            continue
        consecutive_empty = 0

        page_new = 0
        for card in cards:
            row = parse_card(card, deal_type)
            if not row or row["source_url"] in existing:
                continue
            existing.add(row["source_url"])
            batch.append(row)
            page_new += 1

        log(f"  [{deal_type}] p{page_num}: {page_new} new / {len(cards)} cards")

        # Flush batch every 50 listings
        if len(batch) >= 50:
            saved += await upsert_batch(client, batch)
            batch.clear()

        await asyncio.sleep(1.0)

    # Flush remaining
    if batch:
        saved += await upsert_batch(client, batch)

    return saved


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Jerusalem Post Real Estate Scraper starting")
    log(f"max_pages={MAX_PAGES} | concurrency={CONCURRENCY}")
    log("=" * 60)

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        existing = await preload_existing_urls(client)

        sem = asyncio.Semaphore(CONCURRENCY)

        async def run_category(deal, path):
            async with sem:
                try:
                    return await scrape_category(client, existing, deal, path)
                except Exception as e:
                    log(f"Category error {deal}: {e}")
                    return 0

        results = await asyncio.gather(*[run_category(d, p) for d, p in CATEGORIES])
        total   = sum(results)

    log("=" * 60)
    log(f"DONE - {total} new JPost listings saved")
    log("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
