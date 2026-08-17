"""
BebKey - Komo.co.il Real Estate Scraper

Komo is a major Israeli apartment-rental aggregator (~150-300 new listings/day).
The site is server-rendered HTML with pagination - no JS needed.

Index URL patterns:
  https://www.komo.co.il/code/nadlan/rent.asp?nadlan=1&pn=1     (rentals page N)
  https://www.komo.co.il/code/nadlan/sale.asp?nadlan=2&pn=1     (sale page N)

Detail page URL pattern:
  https://www.komo.co.il/code/nadlan/<slug>?cat=1&adid=<id>

Legal: robots.txt allows all real-estate pages.
"""

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx
from bs4 import BeautifulSoup
from quality import enrich
from monitoring import init_sentry
from scraper_utils import get_with_retry, default_browser_headers, CircuitBreaker

init_sentry("komo")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "komo_scraper_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

BASE_URL    = "https://www.komo.co.il"
# Komo migrated to new URL structure (old rent.asp / sale.asp now return 404).
# The new server-rendered pages use currPage= for pagination.
CATEGORIES  = [
    ("rent",    "/code/nadlan/apartments-for-rent.asp"),
    ("forsale", "/code/nadlan/apartments-for-sale.asp"),
]
MAX_PAGES   = int(os.getenv("KOMO_MAX_PAGES", "30"))
CONCURRENCY = int(os.getenv("KOMO_CONCURRENCY", "3"))

# Komo is Hebrew-only.
HEADERS = default_browser_headers(
    referer="https://www.komo.co.il/",
    accept_language="he-IL,he;q=0.9,en;q=0.8",
)

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# ── Supabase helpers ──────────────────────────────────────────────────────────
# Supabase rejects service-role keys sent from "browser-looking" requests
# (Mozilla UA + sec-ch-ua + Sec-Fetch-*).  Use a fresh httpx client with
# the Python-default UA for all REST calls.  `client` param unused.
async def preload_existing_urls(client: httpx.AsyncClient) -> set:
    existing = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{REST_URL}/listings",
                    headers={**SB_HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.komo",
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
    log(f"Preloaded {len(existing)} existing Komo URLs")
    return existing

def insert_listing(data: dict):
    enrich(data)
    try:
        r = httpx.post(f"{REST_URL}/listings?on_conflict=source_url", headers=SB_HEADERS,
                       content=json.dumps(data, ensure_ascii=False).encode("utf-8"),
                       timeout=10)
        if r.status_code in (200, 201):
            log(f"  + {data.get('city')} | {data.get('price')} | {data.get('rooms')}R")
        elif r.status_code != 409:
            log(f"  ! Insert {r.status_code}: {r.text[:100]}")
    except Exception as e:
        log(f"  ! Insert error: {e}")

# ── Parse helpers ─────────────────────────────────────────────────────────────
PRICE_RE   = re.compile(r'(\d[\d,]+)\s*(?:₪|ש"?ח|שח)')
ROOMS_RE   = re.compile(r'(\d+(?:\.\d)?)\s*(?:חדרים|חד\.?|חד\')', re.IGNORECASE)
SIZE_RE    = re.compile(r'(\d+)\s*(?:מ"?ר|מ\'\'?ר|מטר)', re.IGNORECASE)
FLOOR_RE   = re.compile(r'קומה\s*(\d+|קרקע)', re.IGNORECASE)
ADID_RE    = re.compile(r'adid=(\d+)')

def parse_int(text: str | None) -> int | None:
    if not text:
        return None
    m = re.search(r'(\d[\d,]*)', text)
    if not m:
        return None
    try:
        return int(m.group(1).replace(',', ''))
    except ValueError:
        return None

MODAA_ID_RE = re.compile(r'modaaNum=(\d+)')

def extract_listing_card(card, deal_type: str) -> dict | None:
    """
    Extract a listing dict from a Komo result card.
    New Komo structure (2025+):
      - Card: <div id="modaaRowDv{id}" class="modaaRow ...">
      - Detail link: href="/code/nadlan/details/?modaaNum={id}"
      - Price: <td class="tdPrice">
      - Details text: <td class="tdMoreDetails">
      - Address: data-* attribute initaddr or bigtitle on inner div
    """
    # Detail link / listing ID
    a = card.select_one('a[href*="modaaNum="]')
    if not a:
        # Fallback: check for old adid= format
        a = card.select_one('a[href*="adid="]')
    if not a:
        return None
    href = a.get("href") or ""
    if href.startswith("/"):
        href = BASE_URL + href

    # Try modaaNum first, then legacy adid
    id_match = MODAA_ID_RE.search(href) or ADID_RE.search(href)
    if not id_match:
        return None
    listing_id = id_match.group(1)
    source_url = f"{BASE_URL}/code/nadlan/details/?modaaNum={listing_id}"

    # Address - stored in initaddr or bigtitle attribute
    addr_div = card.select_one('[initaddr]')
    raw_addr = (addr_div.get("initaddr") or "") if addr_div else ""
    bigtitle = (addr_div.get("bigtitle") or "") if addr_div else ""

    # City: first comma-separated segment of initaddr (e.g. "תל אביב, הרצל 5" → "תל אביב")
    city = None
    if raw_addr and "," in raw_addr:
        city = raw_addr.split(",")[0].strip()
    elif raw_addr:
        city = raw_addr.strip()

    # Street: second segment of initaddr
    street = None
    if raw_addr and "," in raw_addr:
        parts = raw_addr.split(",", 1)
        street = parts[1].strip() if len(parts) > 1 else None

    # Title from bigtitle or link text
    title = bigtitle.strip() if bigtitle else (a.get_text(strip=True) or None)

    # Price from tdPrice cell
    price = None
    price_el = card.select_one(".tdPrice")
    if price_el:
        price_match = PRICE_RE.search(price_el.get_text(" ", strip=True))
        if price_match:
            price = parse_int(price_match.group(0))

    # Details text (rooms, size, floor)
    full_text = card.get_text(" ", strip=True)

    rooms = None
    rm = ROOMS_RE.search(full_text)
    if rm:
        try: rooms = float(rm.group(1))
        except ValueError: rooms = None

    size_m2 = None
    sm = SIZE_RE.search(full_text)
    if sm:
        try: size_m2 = float(sm.group(1))
        except ValueError: size_m2 = None

    floor = None
    fm = FLOOR_RE.search(full_text)
    if fm:
        floor_raw = fm.group(1)
        floor = 0 if "קרקע" in floor_raw else (int(floor_raw) if floor_raw.isdigit() else None)

    # Images - /api/modaot/tmunot/showPic/list/?picNum=...
    images = []
    for img in card.select("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy") or ""
        if src.startswith("/"):
            src = BASE_URL + src
        if src and ("komo" in src or "picNum=" in src):
            images.append(src)
    images = images[:10]

    return {
        "source":      "komo",
        "source_id":   listing_id,
        "source_url":  source_url,
        "title":       title[:500] if title else None,
        "price":       price,
        "rooms":       rooms,
        "size_m2":     size_m2,
        "floor":       floor,
        "city":        city,
        "street":      street,
        "deal_type":   deal_type,
        "images":      images,
        "is_active":   True,
        "scraped_at":  datetime.now(timezone.utc).isoformat(),
    }

# ── Scrape one category ───────────────────────────────────────────────────────
async def scrape_category(client: httpx.AsyncClient, existing: set,
                          deal_type: str, path: str) -> int:
    saved = 0
    consecutive_empty = 0
    breaker = CircuitBreaker(threshold=5, name=f"komo/{deal_type}")

    for page_num in range(1, MAX_PAGES + 1):
        if breaker.tripped:
            log(breaker.trip_message())
            break
        # Komo pagination: ?pn=N  (page 1 has no parameter)
        # NOTE: ?currPage=N is wrong - it redirects to account.komo.co.il (login page)
        url = f"{BASE_URL}{path}" + (f"?pn={page_num}" if page_num > 1 else "")
        try:
            r = await get_with_retry(client, url, log, timeout=15)
        except Exception as e:
            log(f"  [{deal_type}] p{page_num} fetch error: {e}")
            breaker.record_failure()
            continue

        if r.status_code != 200:
            log(f"  [{deal_type}] p{page_num} HTTP {r.status_code} - stopping")
            break
        breaker.record_success()

        soup  = BeautifulSoup(r.text, "lxml")

        # New structure: cards are <div class="modaaRow ...">
        cards = soup.select('div.modaaRow')

        # Fallback: any table with modaaNum in an href
        if not cards:
            links = soup.select('a[href*="modaaNum="]')
            seen_parents: set[int] = set()
            cards = []
            for a in links:
                parent = a.find_parent(["div", "table", "li", "article", "tr"]) or a
                pid = id(parent)
                if pid not in seen_parents:
                    seen_parents.add(pid)
                    cards.append(parent)

        if not cards:
            consecutive_empty += 1
            if consecutive_empty >= 2:
                log(f"  [{deal_type}] p{page_num} no listings × 2 - stopping")
                break
            continue
        consecutive_empty = 0

        page_new = 0
        for card in cards:
            row = extract_listing_card(card, deal_type)
            if not row:
                continue
            if row["source_url"] in existing:
                continue
            insert_listing(row)
            existing.add(row["source_url"])
            saved += 1
            page_new += 1

        log(f"  [{deal_type}] p{page_num}: {page_new} new / {len(cards)} cards")
        await asyncio.sleep(0.5)  # be polite

    return saved

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    log("=" * 60)
    log("BebKey Komo.co.il Scraper starting")
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

        results = await asyncio.gather(*[
            run_category(d, p) for d, p in CATEGORIES
        ])
        total = sum(results)

    log("=" * 60)
    log(f"DONE - {total} new Komo listings saved")
    log("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
