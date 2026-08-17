"""
BebKey - Janglo.net Real Estate Scraper

Janglo is a static-HTML site (server-side rendered) - no JS required.
Scrapes /real-estate-rentals and /real-estate-for-sale with ?page=N pagination.
Each listing links to /item/{id} where full details are available.

Legal: robots.txt allows all listing pages (only /ads2/ and /BACKUP disallowed).
"""

import asyncio
import json
import os
import re
import sys
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

LOG_FILE = os.path.join(os.path.dirname(__file__), "janglo_scraper_log.txt")

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

BASE_URL  = "https://www.janglo.net"
CATEGORIES = [
    ("rent",    "/real-estate-rentals"),
    ("forsale", "/real-estate-for-sale"),
]
MAX_PAGES   = int(os.getenv("JANGLO_MAX_PAGES", "30"))
CONCURRENCY = int(os.getenv("JANGLO_CONCURRENCY", "3"))
# Janglo is an English-language Anglo site → prefer English Accept-Language.
HEADERS = default_browser_headers(
    referer="https://www.janglo.net/",
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
# (Mozilla UA + sec-ch-ua + Sec-Fetch-*).  Since the site client carries
# all that, every Supabase call uses a fresh httpx.AsyncClient with the
# Python-default UA.  `client` param kept for backward-compat but unused.
async def preload_existing_urls(client: httpx.AsyncClient) -> set:
    existing = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{REST_URL}/listings",
                    headers={**SB_HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.janglo",
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
    log(f"Preloaded {len(existing)} existing Janglo URLs")
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

# ── Parse listing detail page ─────────────────────────────────────────────────
def _parse_price(text: str):
    nums = re.findall(r"[\d,]+", text.replace(",", ""))
    for n in nums:
        try:
            v = int(n)
            if 100 < v < 50_000_000:
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

def parse_detail_page(html: str, source_url: str, deal_type: str) -> dict | None:
    """
    Parse a Janglo.net listing page.

    HTML structure (observed 2025):
      - Title: <h1> with listing headline
      - Price: <span class="nicebreak ...">20,000 NIS</span>
      - Description: <p> tags in listing body
      - Location mentioned in description text or h1 (no dedicated city field)
      - Images: <img> tags for cloudinary/janglo CDN images
    """
    soup = BeautifulSoup(html, "html.parser")

    # Title
    title_el = soup.find("h1")
    title_text = title_el.get_text(strip=True) if title_el else ""

    # Price - Janglo uses <span class="nicebreak">20,000 NIS</span>
    price = None
    # 1. Try nicebreak spans (primary Janglo price pattern)
    for span in soup.find_all("span", class_=re.compile(r"nicebreak", re.I)):
        text = span.get_text(strip=True)
        if re.search(r"NIS|₪|\d[\d,]+", text):
            p = _parse_price(text)
            if p:
                price = p
                break
    # 2. Look for any span/div containing "NIS" or "₪" in <body> (skip head/script)
    if not price:
        body = soup.find("body") or soup
        for el in body.find_all(["span", "div", "p", "strong"],
                                string=re.compile(r"(?:NIS|₪)\s*\d|^\d[\d,]+\s*(?:NIS|₪)")):
            p = _parse_price(el.get_text())
            if p and 500 < p < 50_000_000:
                price = p
                break

    # Description - grab the main <p> paragraphs from body, skip nav/sidebar
    desc = None
    main_el = (soup.find("main") or soup.find("article") or
               soup.find(class_=re.compile(r"content|body|listing|detail|post", re.I)) or
               soup.find("body"))
    if main_el:
        paras = [p.get_text(separator=" ", strip=True)
                 for p in main_el.find_all("p")
                 if len(p.get_text(strip=True)) > 30]
        if paras:
            desc = " ".join(paras[:3])[:1000]
    if not desc:
        desc = title_text or None

    # City - parse from title + description (Janglo listings mention location in text)
    city = None
    KNOWN_CITIES = [
        "Jerusalem", "Tel Aviv", "Haifa", "Beer Sheva", "Be'er Sheva",
        "Netanya", "Rishon", "Petah Tikva", "Ashdod", "Ashkelon",
        "Ramat Gan", "Givatayim", "Beit Shemesh", "Modi'in", "Modiin",
        "Herzliya", "Ra'anana", "Kfar Saba", "Rehovot", "Holon",
        "Bnei Brak", "Bat Yam", "Ramat HaSharon", "Yavne", "Eilat",
        "Tiberias", "Acre", "Akko", "Nazareth", "Karmiel", "Nahariya",
        "Safed", "Zfat", "Afula", "Sderot", "Lod", "Ramla",
        # Jerusalem neighborhoods
        "Katamon", "Rehavia", "Baka", "Ramot", "Talpiot",
        "Talbiya", "Talbieh", "Nachlaot", "Arnona", "Malcha",
        "Givat Shaul", "Sanhedria", "Har Nof", "Pisgat Ze'ev",
        "German Colony", "Abu Tor", "Old City",
    ]
    search_text = f"{title_text} {desc or ''}"
    for c in KNOWN_CITIES:
        if c.lower() in search_text.lower():
            # Map neighborhoods to their city
            if c in ("Katamon", "Rehavia", "Baka", "Ramot", "Talpiot",
                     "Talbiya", "Talbieh", "Nachlaot", "Arnona", "Malcha",
                     "Givat Shaul", "Sanhedria", "Har Nof", "Pisgat Ze'ev",
                     "German Colony", "Abu Tor", "Old City"):
                city = "Jerusalem"
            else:
                city = c
            break
    city = normalize_city(city)   # English → Hebrew

    # Rooms - search description and title
    rooms = None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:room|bedroom|BR)s?", search_text, re.I)
    if m:
        try:
            rooms = float(m.group(1))
        except ValueError:
            pass

    # Size (sqm)
    size_m2 = None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:sqm|sq\.m|m²|square meter)", search_text, re.I)
    if m:
        try:
            size_m2 = float(m.group(1))
        except ValueError:
            pass

    # Floor
    floor = None
    m = re.search(r"(?:floor|storey|story)\s+(\d+)", search_text, re.I)
    if m:
        try:
            floor = int(m.group(1))
        except ValueError:
            pass

    # Images - skip tiny icons and navigational images
    images = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue
        if not any(ext in src.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")):
            continue
        if any(skip in src.lower() for skip in ("logo", "icon", "avatar", "banner", "ad")):
            continue
        if not src.startswith("http"):
            src = BASE_URL + src
        if src not in images:
            images.append(src)
    images = images[:10]

    if not price and not rooms and not images:
        return None

    return {
        "source": "janglo", "source_url": source_url, "deal_type": deal_type,
        "price": price, "city": city, "street": None,
        "size_m2": size_m2, "rooms": rooms, "floor": floor,
        "description": desc, "images": images, "is_active": True,
        "lat": None, "lng": None,
    }

# ── Scrape one category (rent / forsale) ─────────────────────────────────────
async def scrape_category(client: httpx.AsyncClient, deal_type: str,
                          path: str, existing_urls: set,
                          seen_urls: set) -> int:
    new_count = 0
    for page_num in range(1, MAX_PAGES + 1):
        url = f"{BASE_URL}{path}" + (f"?page={page_num}" if page_num > 1 else "")
        try:
            r = await get_with_retry(client, url, log, timeout=20)
            if r.status_code == 404:
                break
            if r.status_code != 200:
                log(f"  {deal_type} p{page_num}: HTTP {r.status_code}")
                break
            soup = BeautifulSoup(r.text, "html.parser")

            # DIAGNOSTIC: log key signals on page 1 so CI logs always reveal
            # what Janglo actually sent (bot-block, redirect, real HTML, etc.)
            if page_num == 1:
                title_el = soup.find("title")
                page_title = title_el.get_text(strip=True) if title_el else "(no title)"
                body_len = len(r.text)
                final_url = str(r.url)
                lower_html = r.text[:4000].lower()
                bot_flags = [
                    kw for kw in (
                        "cloudflare", "captcha", "enable javascript",
                        "access denied", "403 forbidden", "just a moment",
                        "ddos-guard", "human verification",
                    )
                    if kw in lower_html
                ]
                log(
                    f"  DIAG p1: status={r.status_code} "
                    f"final_url={final_url!r} "
                    f"body_len={body_len} "
                    f"title={page_title!r} "
                    f"bot_flags={bot_flags!r}"
                )
                # Dump first 500 chars of body to see structure
                log(f"  DIAG body[:500]: {r.text[:500]!r}")

            # Collect listing links - href is "item/{id}" (no leading slash).
            # Janglo migrated from numeric IDs to alphanumeric ones (~11 chars
            # mixing case + digits, e.g. "item/4hOcaEy3Ktm").  The old
            # `r"item/\d+"` regex matched zero links after the migration -
            # this broader pattern handles both formats.
            links = set()
            for a in soup.find_all("a", href=re.compile(r"item/[a-zA-Z0-9]+")):
                href = a["href"]
                if href.startswith("http"):
                    links.add(href)
                elif href.startswith("/"):
                    links.add(BASE_URL + href)
                else:
                    links.add(BASE_URL + "/" + href)

            if not links:
                log(f"  {deal_type} p{page_num}: no links found - stopping")
                break

            log(f"  {deal_type} p{page_num}: {len(links)} listings")
            new_on_page = 0
            for listing_url in links:
                seen_urls.add(listing_url)   # track every URL we encounter
                if listing_url in existing_urls:
                    continue
                try:
                    dr = await get_with_retry(client, listing_url, log, timeout=15)
                    if dr.status_code != 200:
                        continue
                    row = parse_detail_page(dr.text, listing_url, deal_type)
                    if row:
                        insert_listing(row)
                        existing_urls.add(listing_url)
                        new_count += 1
                        new_on_page += 1
                    await asyncio.sleep(0.3)
                except Exception as e:
                    log(f"    Detail error {listing_url}: {e}")

            log(f"  {deal_type} p{page_num}: {new_on_page} new inserted")
            if new_on_page == 0 and page_num > 1:
                break
            await asyncio.sleep(0.5)
        except Exception as e:
            log(f"  {deal_type} p{page_num} error: {e}")
            break

    return new_count


async def refresh_scraped_at(client: httpx.AsyncClient, urls: set):
    """PATCH scraped_at = now() for all URLs seen in this run (in batches of 200).
    Uses a fresh Supabase client (see preload_existing_urls comment)."""
    url_list = list(urls)
    batch_size = 200
    refreshed = 0
    async with httpx.AsyncClient(timeout=30) as sb:
        for i in range(0, len(url_list), batch_size):
            batch = url_list[i : i + batch_size]
            # Build a comma-separated list of quoted URL values for the `in.()` filter
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
    log(f"Refreshed scraped_at for {refreshed} Janglo listings")

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    log("BebKey Janglo Scraper starting")
    log(f"max_pages={MAX_PAGES} | concurrency={CONCURRENCY}")

    async with httpx.AsyncClient(headers=HEADERS, timeout=30,
                                  follow_redirects=True) as client:
        # Warm up: visit the homepage first so Janglo sets a session cookie.
        # Without this, the first listing-page request looks like a direct-nav
        # bot hit which many sites flag.
        try:
            warmup_r = await client.get(BASE_URL + "/", timeout=15)
            log(f"Warmup {BASE_URL}/: HTTP {warmup_r.status_code}, "
                f"cookies={list(client.cookies.keys())!r}")
            await asyncio.sleep(1.5)
        except Exception as e:
            log(f"Warmup failed (continuing anyway): {e}")

        existing_urls = await preload_existing_urls(client)
        seen_urls: set = set()
        total_new = 0
        for deal_type, path in CATEGORIES:
            log(f"Scraping {deal_type}...")
            n = await scrape_category(client, deal_type, path, existing_urls, seen_urls)
            log(f"{deal_type}: {n} new listings")
            total_new += n

        # Refresh scraped_at for every URL seen in this run so deactivate_stale.py
        # knows these listings are still live.
        if seen_urls:
            log(f"Refreshing scraped_at for {len(seen_urls)} seen URLs...")
            await refresh_scraped_at(client, seen_urls)

    log(f"DONE - {total_new} new Janglo listings saved to Supabase")

if __name__ == "__main__":
    asyncio.run(main())
