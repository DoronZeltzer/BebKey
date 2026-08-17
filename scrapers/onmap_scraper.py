"""
BebKey - OnMap.co.il Real Estate Scraper

OnMap uses Next.js SSR. Their sitemap XMLs list every listing URL:
  https://www.onmap.co.il/sitemap-sale-en.xml
  https://www.onmap.co.il/sitemap-rent-en.xml

Phase 1: Download sitemaps → collect all listing URLs
Phase 2: Fetch each /en/home-details/... page → parse SSR HTML

Legal: robots.txt allows all /en/home-details/ pages.
"""

import asyncio
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx
from bs4 import BeautifulSoup
from quality import enrich
from city_normalize import normalize_city
from scraper_utils import get_with_retry, default_browser_headers

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "onmap_scraper_log.txt")

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

BASE_URL = "https://www.onmap.co.il"
SITEMAPS = [
    ("forsale", f"{BASE_URL}/sitemap-sale-en.xml"),
    ("rent",    f"{BASE_URL}/sitemap-rent-en.xml"),
]
CONCURRENCY = int(os.getenv("ONMAP_CONCURRENCY", "3"))   # lowered 5→3: OnMap 502s under datacenter-IP load
MAX_LISTINGS = int(os.getenv("ONMAP_MAX_LISTINGS", "10000"))
# How many existing listings to re-fetch each run for price/status updates.
# The sitemap-driven scrape catches NEW URLs but never revisits old ones -
# so we miss price drops, sale-pending status, and "sold/rented" delistings.
# 200/run × 2 runs/day = ~14 days to refresh all 4K listings.
REFRESH_SAMPLE_SIZE = int(os.getenv("ONMAP_REFRESH_SAMPLE", "200"))

# Residential proxy (Webshare). OnMap serves empty/challenge pages to
# datacenter/CI IPs (the run breakdown showed ~1,950 parse_none from 200-but-
# empty bodies), so route ONLY the OnMap site fetches through a real IP. The
# Supabase calls use their own separate clients and stay off the proxy.
_WS_HOST = os.getenv("WEBSHARE_PROXY_HOST", "")
_WS_USER = os.getenv("WEBSHARE_PROXY_USER", "")
_WS_PASS = os.getenv("WEBSHARE_PROXY_PASS", "")
SITE_PROXY = (
    f"http://{_WS_USER}:{_WS_PASS}@{_WS_HOST}"
    if _WS_HOST and _WS_USER and _WS_PASS else None
)

# OnMap serves both English (/en/) and Hebrew listings - prefer English here.
HEADERS = default_browser_headers(
    referer="https://www.onmap.co.il/",
    accept_language="en-US,en;q=0.9,he;q=0.8",
)

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
                    params={"select": "source_url", "source": "eq.onmap",
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
    log(f"Preloaded {len(existing)} existing OnMap URLs")
    return existing

def insert_listing(data: dict):
    enrich(data)   # sets quality_score + has_image
    try:
        r = httpx.post(f"{REST_URL}/listings?on_conflict=source_url", headers=SB_HEADERS,
                       content=json.dumps(data), timeout=10)
        if r.status_code in (200, 201):
            log(f"  + {data.get('city')} | {data.get('price')} | {data.get('rooms')}R")
        elif r.status_code != 409:
            log(f"  ! Insert {r.status_code}: {r.text[:100]}")
    except Exception as e:
        log(f"  ! Insert error: {e}")

# ── Sitemap parsing ───────────────────────────────────────────────────────────
async def fetch_sitemap_urls(client: httpx.AsyncClient, sitemap_url: str) -> list[str]:
    try:
        r = await client.get(sitemap_url, timeout=30)
        if r.status_code != 200:
            log(f"Sitemap {sitemap_url}: HTTP {r.status_code}")
            return []
        root = ET.fromstring(r.text)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        urls = [loc.text for loc in root.findall(".//sm:loc", ns) if loc.text]
        log(f"Sitemap {sitemap_url}: {len(urls)} URLs")
        return urls
    except Exception as e:
        log(f"Sitemap error {sitemap_url}: {e}")
        return []

# ── Parse listing detail page ─────────────────────────────────────────────────
def _parse_price(text: str):
    # Remove commas, find number sequences
    clean = text.replace(",", "").replace("₪", "").replace("NIS", "")
    nums = re.findall(r"\d+", clean)
    for n in nums:
        try:
            v = int(n)
            if 1000 < v < 50_000_000:
                return v
        except ValueError:
            pass
    return None

def _parse_float(text: str):
    m = re.search(r"[\d.]+", text)
    return float(m.group()) if m else None

def _parse_int(text: str):
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None

def parse_listing_page(html: str, source_url: str, deal_type: str) -> dict | None:
    """
    Parse an OnMap listing detail page.

    OnMap is a React app (NOT Next.js). It embeds structured data via:
      1. <script type="application/ld+json"> - schema.org RentalProperty / Apartment
         Contains: price (offers.price), address, geo, name, description
      2. window.__data - full Redux store (mostly UI state; reduxAsyncConnect.propertyDetails
         is empty [[]] on listing pages - all data is in ld+json)

    Parsing strategy:
      - ld+json: price, city, street, lat/lng, description
      - Parse rooms from title/name ("X rooms")
      - Parse size_m2 and floor from description ("Size X m², floor Y")
      - Images: img tags with cloudinary URLs
    """
    soup = BeautifulSoup(html, "html.parser")

    # ── 1. Parse schema.org ld+json ───────────────────────────────────────────
    price = city = street = lat = lng = desc = name = None
    ld_type = None
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(s.string or "")
            # OnMap uses RentalProperty, Apartment, Product, etc.
            if ld.get("@type") and ld.get("address"):
                ld_type = ld.get("@type")
                addr   = ld.get("address") or {}
                city   = normalize_city(addr.get("addressLocality") or addr.get("addressRegion"))
                street = addr.get("streetAddress")
                geo    = ld.get("geo") or {}
                try:
                    lat = float(geo.get("latitude")) if geo.get("latitude") else None
                    lng = float(geo.get("longitude")) if geo.get("longitude") else None
                except (ValueError, TypeError):
                    pass
                desc = (ld.get("description") or "")[:1000]
                name = ld.get("name") or ""
                # Price from offers
                offers = ld.get("offers") or {}
                if offers.get("price"):
                    try:
                        p = int(float(offers["price"]))
                        price = p if 1000 < p < 50_000_000 else None
                    except (ValueError, TypeError):
                        pass
                break
        except Exception:
            pass

    # ── 2. Extract rooms from name / title ────────────────────────────────────
    rooms = None
    title_el = soup.find("title")
    title_text = (title_el.get_text() if title_el else "") or name or ""
    m = re.search(r"(\d+(?:\.\d+)?)\s*rooms?", title_text, re.I)
    if m:
        try:
            rooms = float(m.group(1))
        except ValueError:
            pass

    # ── 3. Parse size_m2 and floor from ld+json description ──────────────────
    size_m2 = floor = None
    if desc:
        sm = re.search(r"[Ss]ize\s+(\d+(?:\.\d+)?)\s*(?:m²|㎡|sqm|sq\.m)", desc)
        if sm:
            try:
                size_m2 = float(sm.group(1))
            except ValueError:
                pass
        fm = re.search(r"[Ff]loor\s+(\d+)", desc)
        if fm:
            try:
                floor = int(fm.group(1))
            except ValueError:
                pass

    # ── 4. Images ─────────────────────────────────────────────────────────────
    _LOGO_KW = ("logo", "icon", "brand", "avatar", "placeholder", "default", "header")
    real_imgs: list[str] = []
    logo_imgs: list[str] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not ("cloudinary" in src or "res.cloudinary" in src or
                "onmap" in src or "amazonaws" in src):
            continue
        if src.endswith(".svg") or src in real_imgs or src in logo_imgs:
            continue
        alt      = (img.get("alt") or "").lower()
        cls      = " ".join(img.get("class") or []).lower()
        src_low  = src.lower()
        in_chrome = bool(img.find_parent(["header", "nav", "footer", "aside"]))
        is_logo  = (in_chrome or
                    any(k in alt     for k in _LOGO_KW) or
                    any(k in cls     for k in _LOGO_KW) or
                    any(k in src_low for k in _LOGO_KW))
        (logo_imgs if is_logo else real_imgs).append(src)
    images = (real_imgs + logo_imgs)[:10]

    if not price and rooms is None:
        return None

    return {
        "source": "onmap", "source_url": source_url, "deal_type": deal_type,
        "price": price, "city": city, "street": street,
        "size_m2": size_m2, "rooms": rooms, "floor": floor,
        "description": desc or None, "images": images, "is_active": True,
        "lat": lat, "lng": lng,
    }

# ── Scrape listings concurrently ──────────────────────────────────────────────
async def scrape_urls(urls: list[str], deal_type: str,
                      existing_urls: set, client: httpx.AsyncClient,
                      seen_urls: set) -> int:
    sem = asyncio.Semaphore(CONCURRENCY)
    new_count = 0
    # Track WHY new URLs don't become rows.  Until now a non-200 (e.g. the 502s
    # OnMap throws at datacenter IPs) was silently dropped, so "0 new" looked
    # like "fully covered" when it was actually "every new fetch failed".
    from collections import Counter
    stats: Counter = Counter()

    async def fetch_one(url: str):
        nonlocal new_count
        seen_urls.add(url)   # track every URL we encounter (new or existing)
        if url in existing_urls:
            stats["skip_existing"] += 1
            return
        async with sem:
            try:
                r = await get_with_retry(client, url, log, timeout=20)
                if r.status_code != 200:
                    stats[f"http_{r.status_code}"] += 1
                    return
                row = parse_listing_page(r.text, url, deal_type)
                if row:
                    insert_listing(row)
                    existing_urls.add(url)
                    new_count += 1
                    stats["saved"] += 1
                else:
                    stats["parse_none"] += 1
                await asyncio.sleep(0.25)
            except Exception as e:
                stats["exception"] += 1
                log(f"  Error {url}: {e}")

    await asyncio.gather(*[fetch_one(u) for u in urls[:MAX_LISTINGS]])
    log(f"  {deal_type} fetch breakdown: "
        + ", ".join(f"{k}={v}" for k, v in sorted(stats.items())) or "  (none)")
    return new_count


async def refresh_existing_listings(client: httpx.AsyncClient,
                                    existing_urls: set,
                                    sample_size: int) -> tuple[int, int, int]:
    """Re-fetch a random sample of EXISTING listings to catch price changes
    and delistings (404 → mark inactive).  Returns (refetched, price_updates,
    delistings).  The sample rotates each run via random selection so we
    cover everything over ~2 weeks of runs."""
    import random
    if sample_size <= 0 or not existing_urls:
        return 0, 0, 0

    sample = random.sample(list(existing_urls), min(sample_size, len(existing_urls)))
    log(f"Refreshing price/status for {len(sample)} existing listings...")

    # Need both deal types - guess from URL slug since the table has it
    # Fetch current rows so we can compare price
    async with httpx.AsyncClient(timeout=30) as sb:
        # Build a map of source_url → current price for the sample
        quoted = ",".join(f'"{u}"' for u in sample)
        try:
            r = await sb.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={"select": "id,source_url,price,deal_type",
                        "source_url": f"in.({quoted})", "limit": sample_size + 50},
            )
            current = {row["source_url"]: row for row in (r.json() or [])}
        except Exception as e:
            log(f"  Refresh preload error: {e}")
            return 0, 0, 0

    refetched = price_updates = delistings = 0
    sem = asyncio.Semaphore(CONCURRENCY)

    async def refetch_one(url: str):
        nonlocal refetched, price_updates, delistings
        cur = current.get(url)
        if not cur:
            return
        async with sem:
            try:
                r = await get_with_retry(client, url, log, timeout=20)
                refetched += 1
                if r.status_code == 404:
                    # Listing removed - mark inactive
                    async with httpx.AsyncClient(timeout=15) as sb:
                        await sb.patch(
                            f"{REST_URL}/listings",
                            headers=SB_HEADERS,
                            params={"id": f"eq.{cur['id']}"},
                            content='{"is_active": false}',
                        )
                    delistings += 1
                    return
                if r.status_code != 200:
                    return

                row = parse_listing_page(r.text, url, cur["deal_type"])
                if not row or not row.get("price"):
                    return

                new_price = row["price"]
                old_price = cur.get("price")
                if old_price and new_price != old_price:
                    # Price changed - PATCH the row
                    async with httpx.AsyncClient(timeout=15) as sb:
                        await sb.patch(
                            f"{REST_URL}/listings",
                            headers=SB_HEADERS,
                            params={"id": f"eq.{cur['id']}"},
                            content=json.dumps({"price": new_price,
                                                "scraped_at": "now()"}),
                        )
                    price_updates += 1
                    delta = new_price - old_price
                    sign  = "+" if delta > 0 else ""
                    log(f"  Δ {url.split('/')[-1][:40]}: {old_price:,} → {new_price:,} ({sign}{delta:,})")
                await asyncio.sleep(0.1)
            except Exception as e:
                log(f"  Refresh error {url[:60]}: {e}")

    await asyncio.gather(*[refetch_one(u) for u in sample])
    log(f"Refresh done - {refetched} fetched, {price_updates} price updates, "
        f"{delistings} delistings")
    return refetched, price_updates, delistings


async def refresh_scraped_at(client: httpx.AsyncClient, urls: set):
    """PATCH scraped_at = now() for all URLs seen in this run (in batches of 200).
    Uses a fresh Supabase client (see preload_existing_urls comment) so the
    browser-like headers from the site client don't trigger Supabase's
    "Forbidden use of secret API key in browser" detection."""
    url_list = list(urls)
    batch_size = 200
    refreshed = 0
    async with httpx.AsyncClient(timeout=30) as sb:
        for i in range(0, len(url_list), batch_size):
            batch = url_list[i : i + batch_size]
            quoted = ",".join(f'"{u}"' for u in batch)
            try:
                r = await sb.patch(
                    f"{REST_URL}/listings",
                    headers=SB_HEADERS,
                    params={"source_url": f"in.({quoted})"},
                    content='{"scraped_at": "now()"}',
                )
                if r.status_code in (200, 204):
                    refreshed += len(batch)
                else:
                    log(f"  scraped_at refresh PATCH {r.status_code}: {r.text[:100]}")
            except Exception as e:
                log(f"  scraped_at refresh error: {e}")
    log(f"Refreshed scraped_at for {refreshed} OnMap listings")

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    log("BebKey OnMap Scraper starting")
    log(f"concurrency={CONCURRENCY} | max_listings={MAX_LISTINGS} | "
        f"proxy={'yes' if SITE_PROXY else 'no'}")

    async with httpx.AsyncClient(headers=HEADERS, timeout=30,
                                  follow_redirects=True, proxy=SITE_PROXY) as client:
        existing_urls = await preload_existing_urls(client)
        seen_urls: set = set()
        total_new = 0

        for deal_type, sitemap_url in SITEMAPS:
            urls = await fetch_sitemap_urls(client, sitemap_url)
            if not urls:
                log(f"No URLs from {sitemap_url}")
                continue
            log(f"Scraping {len(urls)} {deal_type} listings...")
            n = await scrape_urls(urls, deal_type, existing_urls, client, seen_urls)
            log(f"{deal_type}: {n} new listings")
            total_new += n

        # Refresh scraped_at for every URL seen in this run so deactivate_stale.py
        # knows these listings are still live.
        if seen_urls:
            log(f"Refreshing scraped_at for {len(seen_urls)} seen URLs...")
            await refresh_scraped_at(client, seen_urls)

        # Re-fetch a rotating sample of existing listings to catch price
        # changes and delistings (404s).
        refetched, price_updates, delistings = await refresh_existing_listings(
            client, existing_urls, REFRESH_SAMPLE_SIZE
        )

    log(f"DONE - {total_new} new OnMap listings saved to Supabase "
        f"(plus {price_updates} price updates, {delistings} delistings)")

if __name__ == "__main__":
    asyncio.run(main())
