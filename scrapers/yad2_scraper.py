"""
BebKey - Yad2 Scraper v4
Improvements over v3:
  - Dynamic city list: fetches ALL Israeli localities from Yad2's own API at startup
  - Batch duplicate check: preloads all existing source_urls into memory (1 query vs 40,000)
  - Parallel city scraping: 3 cities processed simultaneously via asyncio.Semaphore
  - Per-city pagination: up to YAD2_MAX_PAGES pages per city/deal_type

Legal:
  - No private phone numbers stored
  - Images hotlinked from Yad2 CDN (no re-hosting)
  - Source attributed with back-link to original listing
"""

import asyncio, json, os, sys, random
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
import httpx

LOG_FILE = os.path.join(os.path.dirname(__file__), "yad2_scraper_log.txt")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(0)

REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f: f.write(line + "\n")

# ── Fallback city list (used if API fetch fails) ──────────────────────────────
FALLBACK_CITIES = [
    ("תל אביב יפו", 5000, 1, 3), ("ירושלים", 3000, 6, 2), ("חיפה", 4000, 8, 1),
    ("ראשון לציון", 8300, 2, 3), ("פתח תקוה", 7900, 2, 3), ("אשדוד", 70, 4, 4),
    ("נתניה", 7400, 3, 3), ("באר שבע", 1024, 7, 5), ("בני ברק", 1014, 2, 3),
    ("חולון", 2400, 2, 3), ("רמת גן", 8600, 2, 3), ("גבעתיים", 2200, 2, 3),
    ("בת ים", 9200, 2, 3), ("הרצליה", 2650, 2, 3), ("רעננה", 8700, 2, 3),
    ("כפר סבא", 6900, 2, 3), ("הוד השרון", 6500, 2, 3), ("נס ציונה", 7300, 2, 3),
    ("יבנה", 2530, 4, 4), ("ראש העין", 8100, 2, 3), ("אור יהודה", 230, 2, 3),
    ("לוד", 7100, 2, 3), ("רמלה", 8500, 2, 3), ("גבעת שמואל", 2100, 2, 3),
    ("אזור", 100, 2, 3), ("רחובות", 8400, 2, 3), ("בית שמש", 1008, 6, 2),
    ("מודיעין", 67, 6, 2), ("מעלה אדומים", 6750, 6, 2), ("גבעת זאב", 2250, 6, 2),
    ("אריאל", 75, 6, 2), ("קריית ביאליק", 6300, 8, 1), ("קריית אתא", 6200, 8, 1),
    ("קריית מוצקין", 6400, 8, 1), ("קריית ים", 6250, 8, 1), ("נהריה", 7100, 8, 1),
    ("עכו", 1085, 8, 1), ("כרמיאל", 5540, 8, 1), ("מגדל העמק", 6700, 8, 1),
    ("עפולה", 7855, 8, 1), ("נצרת", 7590, 8, 1), ("טבריה", 9050, 8, 1),
    ("צפת", 9150, 8, 1), ("קריית שמונה", 6210, 8, 1), ("אשקלון", 190, 4, 4),
    ("אילת", 209, 5, 5), ("קריית גת", 6100, 4, 4), ("דימונה", 1045, 7, 5),
    ("שדרות", 8900, 4, 4), ("נתיבות", 7350, 4, 4), ("אופקים", 120, 4, 4),
    ("ירוחם", 2570, 7, 5), ("יהוד", 2540, 2, 3), ("חדרה", 2300, 3, 3),
]

# ── Dynamically fetch ALL cities from Yad2's city API ────────────────────────
async def fetch_all_yad2_cities():
    """
    Calls Yad2's geo-service API to get every locality in Israel (cities,
    kibbutzim, moshavim, Arab towns, ...). Falls back to FALLBACK_CITIES on error.
    Returns list of (name, city_id, area_id, region_id).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "he-IL,he;q=0.9",
        "Referer": "https://www.yad2.co.il/",
    }
    # Try multiple known Yad2 city-list endpoints
    endpoints = [
        "https://gw.yad2.co.il/geo-service/cities?lang=he&limit=5000",
        "https://gw.yad2.co.il/common/single-autocomplete?text=&type=realestate_city&limit=5000",
        "https://gw.yad2.co.il/common/multi_autocomplete?text=&type=city&limit=5000&lang=he",
    ]
    async with httpx.AsyncClient(headers=headers, timeout=20, follow_redirects=True) as client:
        for url in endpoints:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                body = r.json()

                # Normalise various response shapes
                items = (
                    body if isinstance(body, list) else
                    body.get("data", body.get("items", body.get("cities", [])))
                )
                if not items:
                    continue

                cities = []
                for item in items:
                    city_id   = item.get("id") or item.get("cityId") or item.get("value")
                    name      = (item.get("displayName") or item.get("text") or
                                 item.get("name") or "")
                    area_id   = item.get("areaId") or item.get("area") or 0
                    region_id = item.get("topAreaId") or item.get("topArea") or 0
                    if city_id and name:
                        cities.append((name, int(city_id), int(area_id), int(region_id)))

                if cities:
                    log(f"Dynamic city fetch: {len(cities)} localities from {url}")
                    return cities
            except Exception as e:
                log(f"City API attempt failed ({url}): {e}")
                continue

    log(f"Dynamic city fetch failed - using fallback list ({len(FALLBACK_CITIES)} cities)")
    return FALLBACK_CITIES

# ── Batch preload existing source_urls ────────────────────────────────────────
async def preload_existing_urls():
    """
    Fetches ALL existing Yad2 source_urls from Supabase in one paginated query.
    Returns a set - O(1) lookups replace per-listing HTTP round-trips.
    """
    existing = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                r = await client.get(
                    f"{REST_URL}/listings",
                    headers={**HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.yad2",
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
                log(f"Preload chunk error (offset={offset}): {e}")
                break
    log(f"Preloaded {len(existing)} existing Yad2 URLs")
    return existing

# ── Insert a listing ──────────────────────────────────────────────────────────
HEADERS_INSERT = {
    **HEADERS,
    # ON CONFLICT (source_url) DO NOTHING - requires unique constraint on source_url
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}

def insert_listing(data):
    try:
        r = httpx.post(f"{REST_URL}/listings", headers=HEADERS_INSERT,
                       content=json.dumps(data), timeout=10)
        if r.status_code in (200, 201):
            log(f"  ✓ {data.get('city')} | {data.get('price')} | "
                f"{data.get('rooms')}R | {data.get('size_m2')}m²")
        elif r.status_code == 409:
            pass  # unique constraint hit - already handled by in-memory set, just in case
        else:
            log(f"  ✗ Insert failed ({r.status_code}): {r.text[:150]}")
    except Exception as e:
        log(f"  ✗ Insert error: {e}")

# ── Parse a map marker or __NEXT_DATA__ feed item ─────────────────────────────
def _bool_flag(val):
    """Coerce various truthy API values to bool or None."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val > 0
    if isinstance(val, str):
        return val.lower() not in ("false", "0", "no", "")
    return None

def parse_marker(marker, deal_type="forsale"):
    try:
        token = marker.get("token") or marker.get("id")
        if not token:
            return None

        addr         = marker.get("address") or {}
        city         = (addr.get("city") or {}).get("text")
        neighborhood = (addr.get("neighborhood") or {}).get("text")
        street_name  = (addr.get("street") or {}).get("text") or ""
        house_num    = str((addr.get("house") or {}).get("number") or "")
        street       = f"{street_name} {house_num}".strip() or None

        ad        = marker.get("additionalDetails") or {}
        rooms_raw = ad.get("roomsCount")
        rooms     = float(rooms_raw) if rooms_raw is not None else None
        if rooms is not None and (rooms < 1 or rooms > 20):
            rooms = None
        size_m2      = ad.get("squareMeter")
        prop_text    = (ad.get("property") or {}).get("text")
        floor_raw    = ad.get("floor")
        floor        = int(floor_raw) if floor_raw is not None else None
        total_floors = ad.get("buildingFloors") or ad.get("totalFloors") or ad.get("floor_count")
        try:
            total_floors = int(total_floors) if total_floors is not None else None
        except (ValueError, TypeError):
            total_floors = None

        # Description - try multiple field names
        description = (
            ad.get("info") or ad.get("text") or ad.get("description") or
            marker.get("description") or None
        )
        if description:
            description = str(description).strip() or None

        # Boolean amenity flags
        parking       = _bool_flag(ad.get("parking") or ad.get("parkingAvailable"))
        elevator      = _bool_flag(ad.get("elevator"))
        balcony       = _bool_flag(ad.get("balcony"))
        mamad         = _bool_flag(ad.get("shelter") or ad.get("safeRoom") or ad.get("mamad"))
        furnished     = _bool_flag(ad.get("furniture") or ad.get("furnished"))
        air_cond      = _bool_flag(ad.get("air_conditioner") or ad.get("air_conditioning") or ad.get("airConditioning"))
        accessible    = _bool_flag(ad.get("accessibility") or ad.get("accessible") or ad.get("accessibleToDisabled"))
        storage_room  = _bool_flag(ad.get("storeroom") or ad.get("storage") or ad.get("storageRoom"))

        meta      = marker.get("metaData") or {}
        cover     = meta.get("coverImage") or ""
        images    = []
        for img in ([cover] + (meta.get("images") or [])):
            if img and img not in images:
                images.append(img)
        images = images[:10]

        price_raw = marker.get("price")
        price     = int(price_raw) if price_raw else None
        if not price:
            ad_price = ad.get("minPrice") or ad.get("price")
            price    = int(ad_price) if ad_price else None

        # Skip absurd prices (> 50M ILS)
        if price and price > 50_000_000:
            return None

        lat = lng = None
        coords = marker.get("coordinates") or marker.get("coordinate") or {}
        if isinstance(coords, dict):
            lat = coords.get("latitude") or coords.get("lat")
            lng = coords.get("longitude") or coords.get("lng") or coords.get("lon")
        if lat is None: lat = marker.get("latitude") or marker.get("lat")
        if lng is None: lng = marker.get("longitude") or marker.get("lng") or marker.get("lon")
        try:
            lat = float(lat) if lat is not None else None
            lng = float(lng) if lng is not None else None
        except (ValueError, TypeError):
            lat = lng = None

        # Canonical source URL - prefer url from API, fallback to constructed
        source_url = (
            marker.get("url") or
            marker.get("link") or
            f"https://www.yad2.co.il/item/{token}"
        )
        # Ensure absolute URL
        if source_url and source_url.startswith("/"):
            source_url = "https://www.yad2.co.il" + source_url

        if not price and rooms is None and not images:
            return None

        return {
            "source": "yad2", "source_url": source_url, "deal_type": deal_type,
            "price": price, "city": city, "street": street,
            "neighborhood": neighborhood,
            "size_m2": float(size_m2) if size_m2 else None,
            "rooms": rooms, "floor": floor, "total_floors": total_floors,
            "property_type": prop_text,
            "lat": lat, "lng": lng,
            "description": description,
            "contact_phone": None,  # Yad2 hides phones behind auth
            "images": images, "is_active": True,
            # Boolean amenities
            "parking":          parking,
            "elevator":         elevator,
            "balcony":          balcony,
            "mamad":            mamad,
            "furnished":        furnished,
            "air_conditioning": air_cond,
            "accessible":       accessible,
            "storage_room":     storage_room,
        }
    except Exception as e:
        log(f"  Parse error: {e}")
        return None

# ── Scrape one city / deal_type with pagination ───────────────────────────────
async def scrape_city(browser, existing_urls, city_name, city_id,
                      area_id, region_id, deal_type):
    yad2_max_pages = int(os.getenv("YAD2_MAX_PAGES", "8"))

    # Build base URL - area/region optional; Yad2 works with city_id alone
    base_url = f"https://www.yad2.co.il/realestate/{deal_type}?city={city_id}"
    if area_id:
        base_url += f"&topArea={region_id}&area={area_id}"

    log(f"Scraping {city_name} ({deal_type}) - up to {yad2_max_pages} pages")

    all_collected = []
    seen_tokens   = set()
    total_pages   = yad2_max_pages

    context = await browser.new_context(
        viewport={"width": 1440, "height": 900}, locale="he-IL",
        extra_http_headers={"Accept-Language": "he-IL,he;q=0.9"},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )

    for page_num in range(1, yad2_max_pages + 1):
        if page_num > total_pages:
            break

        url          = base_url + (f"&page={page_num}" if page_num > 1 else "")
        page_collected = []

        page = await context.new_page()
        await stealth_async(page)

        async def handle_response(response):
            if "realestate-feed/" not in response.url and "feed" not in response.url:
                return
            if "json" not in response.headers.get("content-type", ""):
                return
            try:
                body = await response.json()
            except Exception:
                return
            data = body.get("data") if isinstance(body, dict) else body
            if not isinstance(data, dict):
                return
            items = (data.get("markers", []) + data.get("yad1Markers", []) +
                     data.get("agencyPromotions", []))
            if items:
                log(f"    ↳ Map API p{page_num}: {len(items)} items")
                page_collected.extend(items)

        page.on("response", handle_response)

        try:
            await page.goto(url, timeout=45000, wait_until="load")
        except Exception as e:
            log(f"  p{page_num} load warning: {type(e).__name__}")

        try:
            title = await page.title()
            if "captcha" in title.lower() or "shieldsquare" in title.lower():
                log(f"  ⚠ Bot check on p{page_num} - stopping city")
                await page.close()
                break
        except Exception:
            pass

        await asyncio.sleep(4)

        try:
            next_raw = await page.evaluate(
                "() => document.getElementById('__NEXT_DATA__')?.textContent"
            )
            if next_raw:
                nd         = json.loads(next_raw)
                page_props = nd.get("props", {}).get("pageProps", {})
                feed       = page_props.get("feed", {})

                if page_num == 1:
                    pagination   = page_props.get("pagination", {})
                    server_total = int(pagination.get("totalPages", yad2_max_pages))
                    total_pages  = min(server_total, yad2_max_pages)
                    log(f"  {city_name}: {server_total} pages on server → scraping {total_pages}")

                if isinstance(feed, dict):
                    extra = (feed.get("private", []) + feed.get("agency", []) +
                             feed.get("platinum", []))
                    if extra:
                        log(f"    ↳ __NEXT_DATA__ p{page_num}: {len(extra)} items")
                        page_collected.extend(extra)
        except Exception as e:
            log(f"  __NEXT_DATA__ p{page_num} error: {e}")

        await page.close()

        new_in_page = 0
        for m in page_collected:
            tok = m.get("token") or m.get("id")
            if tok and tok not in seen_tokens:
                seen_tokens.add(tok)
                all_collected.append(m)
                new_in_page += 1

        log(f"  p{page_num}/{total_pages}: {new_in_page} new (total {len(all_collected)})")
        if new_in_page == 0 and page_num > 1:
            break

        if page_num < total_pages:
            await asyncio.sleep(random.uniform(3, 6))

    await context.close()

    # ── Insert, using in-memory set instead of per-listing HTTP check ─────────
    new_count = skip_count = 0
    for marker in all_collected:
        data = parse_marker(marker, deal_type)
        if not data:
            continue
        if data["source_url"] in existing_urls:
            skip_count += 1
            continue
        insert_listing(data)
        existing_urls.add(data["source_url"])   # keep set current
        new_count += 1
        await asyncio.sleep(0.1)

    log(f"  {city_name} ({deal_type}): ✓ {new_count} new | ⟳ {skip_count} skipped")
    return new_count, skip_count

# ── Main ──────────────────────────────────────────────────────────────────────
async def run():
    log("=" * 60)
    log("BebKey Yad2 Scraper v4 started")

    is_ci    = "SCRAPER_MAX_PAGES" in os.environ
    headless = is_ci
    concurrency  = int(os.getenv("SCRAPER_CONCURRENCY", "3"))
    yad2_max = int(os.getenv("YAD2_MAX_PAGES", "8"))
    log(f"Mode: {'CI' if is_ci else 'local'} | headless={headless} | "
        f"concurrency={concurrency} | YAD2_MAX_PAGES={yad2_max}")

    # 1. Preload existing URLs (batch - replaces 40k individual HTTP checks)
    existing_urls = await preload_existing_urls()

    # 2. Fetch ALL Israeli localities from Yad2's API
    cities = await fetch_all_yad2_cities()
    log(f"Cities to scrape: {len(cities)}")

    deal_types = ["forsale", "rent"]
    total_new = total_skip = 0
    sem = asyncio.Semaphore(concurrency)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-dev-shm-usage",
                  "--disable-blink-features=AutomationControlled"] if headless else
                 ["--start-maximized", "--disable-blink-features=AutomationControlled"],
        )

        async def scrape_with_sem(city_name, city_id, area_id, region_id, deal_type):
            async with sem:
                try:
                    return await scrape_city(browser, existing_urls,
                                             city_name, city_id, area_id,
                                             region_id, deal_type)
                except Exception as e:
                    log(f"Error {city_name}/{deal_type}: {e}")
                    return (0, 0)

        # 3. Launch ALL city/deal tasks in parallel (semaphore limits concurrency)
        tasks = [
            scrape_with_sem(city_name, city_id, area_id, region_id, deal_type)
            for city_name, city_id, area_id, region_id in cities
            for deal_type in deal_types
        ]
        log(f"Launching {len(tasks)} tasks ({concurrency} concurrent)...")
        results = await asyncio.gather(*tasks)

        await browser.close()

    for new, skip in results:
        total_new  += new
        total_skip += skip

    log(f"Yad2 done - ✓ {total_new} new | ⟳ {total_skip} skipped")

if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as e:
        log(f"Fatal error: {e}")
        sys.exit(0)
