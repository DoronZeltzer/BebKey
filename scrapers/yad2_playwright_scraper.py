"""
BebKey - Yad2 Playwright Scraper (no Apify, runs free on GitHub Actions)

Uses Playwright headless Chromium to visit Yad2 listing pages and intercepts
the realestate-feed XHR responses.  Falls back to __NEXT_DATA__ extraction
if XHR interception yields nothing.  No proxy required.

Note: The direct gw.yad2.co.il map API returns HTTP 302 from GitHub Actions
IPs (anti-scraping redirect), but the full website load via browser works.

Env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  YAD2_PW_MAX_PAGES    (default 5 per city/deal)
  YAD2_PW_CONCURRENCY  (default 2)
"""

import asyncio
import json
import os
import random
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from playwright.async_api import async_playwright
from dotenv import load_dotenv
from quality import enrich
from monitoring import init_sentry, ping_dead_man

init_sentry("yad2_playwright")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "yad2_playwright_log.txt")

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

MAX_PAGES   = int(os.getenv("YAD2_PW_MAX_PAGES",   "5"))
CONCURRENCY = int(os.getenv("YAD2_PW_CONCURRENCY", "2"))

DEAL_TYPES = [("forsale", "forsale"), ("rent", "rent")]

# ── City list ─────────────────────────────────────────────────────────────────
# Format: (hebrew_name, yad2_city_id, yad2_area_id, yad2_region_id)
CITIES = [
    # Tel Aviv & Gush Dan
    ("תל אביב יפו", 5000, 1, 3), ("רמת גן", 8600, 2, 3), ("גבעתיים", 2200, 2, 3),
    ("בני ברק", 1014, 2, 3), ("חולון", 2400, 2, 3), ("בת ים", 9200, 2, 3),
    ("רמת השרון", 8550, 2, 3), ("הרצליה", 2650, 2, 3), ("פתח תקוה", 7900, 2, 3),
    ("ראשון לציון", 8300, 2, 3), ("רחובות", 8400, 2, 3), ("נס ציונה", 7300, 2, 3),
    ("קריית אונו", 6700, 2, 3), ("יהוד", 2540, 2, 3), ("אור יהודה", 230, 2, 3),
    ("גני תקווה", 648, 2, 3), ("סביון", 896, 2, 3), ("גבעת שמואל", 2100, 2, 3),
    ("אזור", 100, 2, 3),
    # Sharon
    ("רעננה", 8700, 2, 3), ("כפר סבא", 6900, 2, 3), ("הוד השרון", 6500, 2, 3),
    ("ראש העין", 8100, 2, 3), ("נתניה", 7400, 3, 3), ("אבן יהודה", 145, 3, 3),
    ("תל מונד", 9700, 3, 3), ("קדימה צורן", 9500, 3, 3), ("חדרה", 2300, 3, 3),
    ("פרדס חנה כרכור", 7800, 3, 3), ("בנימינה גבעת עדה", 690, 3, 3),
    ("זכרון יעקב", 2900, 3, 3), ("קיסריה", 1136, 3, 3), ("אור עקיבא", 250, 3, 3),
    ("חריש", 1294, 3, 3), ("פרדסיה", 7950, 3, 3), ("כפר יונה", 6800, 3, 3),
    ("בית דגן", 650, 2, 3), ("שוהם", 9000, 2, 3), ("אלעד", 1240, 2, 3),
    # Shfela / Jerusalem corridor
    ("לוד", 7100, 2, 3), ("רמלה", 8500, 2, 3), ("באר יעקב", 480, 4, 4),
    ("מזכרת בתיה", 7000, 4, 4), ("גדרה", 2150, 4, 4), ("יבנה", 2530, 4, 4),
    ("גן יבנה", 2410, 4, 4), ("מודיעין מכבים רעות", 1200, 6, 2),
    ("בית שמש", 1008, 6, 2), ("ירושלים", 3000, 6, 2), ("מבשרת ציון", 7050, 6, 2),
    ("גבעת זאב", 2250, 6, 2), ("מעלה אדומים", 6750, 6, 2),
    ("ביתר עילית", 607, 6, 2), ("אפרת", 179, 6, 2), ("מודיעין עילית", 1247, 6, 2),
    ("קריית ארבע", 6800, 6, 2), ("אריאל", 75, 2, 3),
    # Haifa & Krayot
    ("חיפה", 4000, 8, 1), ("קריית אתא", 6200, 8, 1), ("קריית ביאליק", 6300, 8, 1),
    ("קריית מוצקין", 6400, 8, 1), ("קריית ים", 6500, 8, 1), ("נשר", 7600, 8, 1),
    ("טירת כרמל", 9300, 8, 1), ("יקנעם עילית", 370, 8, 1), ("נהריה", 7100, 8, 1),
    ("עכו", 1085, 8, 1), ("כרמיאל", 5540, 8, 1), ("מעלות תרשיחא", 1063, 8, 1),
    ("שלומי", 9100, 8, 1),
    # North / Galilee
    ("נצרת", 7590, 8, 1), ("נוף הגליל", 1061, 8, 1), ("עפולה", 7855, 8, 1),
    ("טבריה", 9050, 8, 1), ("צפת", 9150, 8, 1), ("קריית שמונה", 6210, 8, 1),
    ("מגדל העמק", 6700, 8, 1), ("בית שאן", 665, 8, 1), ("חצור הגלילית", 2620, 8, 1),
    # Arab towns
    ("אום אל פחם", 1090, 8, 1), ("טייבה", 9520, 2, 3), ("טירה", 9430, 2, 3),
    ("שפרעם", 8800, 8, 1), ("סח'נין", 8400, 8, 1), ("טמרה", 8900, 8, 1),
    ("מגאר", 1075, 8, 1), ("כפר כנא", 1208, 8, 1), ("ערערה", 294, 8, 1),
    ("באקה אל גרבייה", 511, 8, 1), ("רהט", 1192, 7, 5),
    # South / Negev
    ("באר שבע", 1024, 7, 5), ("דימונה", 1045, 7, 5), ("ערד", 1075, 7, 5),
    ("מצפה רמון", 1175, 7, 5), ("אילת", 209, 5, 5), ("ירוחם", 2570, 7, 5),
    ("אופקים", 120, 4, 4), ("נתיבות", 7350, 4, 4), ("שדרות", 8900, 4, 4),
    ("אשקלון", 190, 4, 4), ("אשדוד", 70, 4, 4), ("קריית מלאכי", 6500, 4, 4),
    ("קריית גת", 6100, 4, 4),
]

# ── Stealth JS ────────────────────────────────────────────────────────────────
STEALTH_JS = """
    () => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
        const orig = navigator.__proto__;
        delete orig.webdriver;
    }
"""

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


async def apply_stealth(page) -> None:
    await page.add_init_script(STEALTH_JS)


# ── Supabase ──────────────────────────────────────────────────────────────────
async def preload_existing_urls(client: httpx.AsyncClient) -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    while True:
        try:
            r = await client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={"select": "source_url", "source": "eq.yad2",
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
            log(f"Preload error: {e}")
            break
    log(f"Preloaded {len(existing)} existing Yad2 URLs")
    return existing


async def upsert_batch(client: httpx.AsyncClient, rows: list[dict]) -> int:
    if not rows:
        return 0
    for row in rows:
        enrich(row)
    try:
        r = await client.post(
            # on_conflict=source_url merges on the unique source_url constraint
            # so duplicate URLs become UPDATEs instead of dropping the batch.
            f"{REST_URL}/listings?on_conflict=source_url",
            headers=SB_HEADERS,
            content=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
            timeout=30,
        )
        if r.status_code in (200, 201):
            return len(rows)
        log(f"  ⚠ Supabase upsert {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log(f"  ⚠ Supabase upsert error: {e}")
    return 0


# ── Parse marker ──────────────────────────────────────────────────────────────
def _bool_flag(val):
    if val is None: return None
    if isinstance(val, bool): return val
    if isinstance(val, (int, float)): return val > 0
    if isinstance(val, str): return val.lower() not in ("false", "0", "no", "")
    return None


def parse_marker(marker: dict, deal_type: str) -> dict | None:
    try:
        token = (marker.get("token") or marker.get("id")
                 or marker.get("orderId") or marker.get("order_id"))
        if not token:
            return None

        addr        = marker.get("address") or {}
        city        = (addr.get("city") or {}).get("text", "")
        street_name = (addr.get("street") or {}).get("text", "")
        house_num   = str((addr.get("house") or {}).get("number") or "")
        street      = f"{street_name} {house_num}".strip() or None
        floor       = (addr.get("house") or {}).get("floor")
        try:
            floor = int(floor) if floor is not None else None
        except (TypeError, ValueError):
            floor = None

        ad       = marker.get("additionalDetails") or {}
        rooms    = ad.get("roomsCount")
        try:
            rooms = float(rooms) if rooms is not None else None
            if rooms and (rooms < 1 or rooms > 20):
                rooms = None
        except (TypeError, ValueError):
            rooms = None

        size_m2 = ad.get("squareMeter") or (marker.get("metaData") or {}).get("squareMeterBuild")
        try:
            size_m2 = float(size_m2) if size_m2 is not None else None
        except (TypeError, ValueError):
            size_m2 = None

        desc = (ad.get("info") or ad.get("text") or ad.get("description")
                or marker.get("description") or "").strip() or None

        meta   = marker.get("metaData") or {}
        cover  = meta.get("coverImage") or ""
        images = []
        for img in ([cover] + (meta.get("images") or [])):
            if img and img not in images:
                images.append(img)
        images = images[:10]

        price = marker.get("price")
        try:
            price = int(price) if price else None
        except (TypeError, ValueError):
            price = None
        if not price:
            ap = ad.get("minPrice") or ad.get("price")
            try:
                price = int(ap) if ap else None
            except (TypeError, ValueError):
                price = None
        if price and price > 50_000_000:
            return None

        lat = lng = None
        coords = (marker.get("address") or {}).get("coords") or {}
        if not coords:
            coords = marker.get("coordinates") or marker.get("coordinate") or {}
        if isinstance(coords, dict):
            try:
                lat = float(coords.get("lat") or coords.get("latitude") or 0) or None
                lng = float(coords.get("lon") or coords.get("lng") or coords.get("longitude") or 0) or None
            except (TypeError, ValueError):
                pass

        source_url = (marker.get("url") or marker.get("link")
                      or f"https://www.yad2.co.il/item/{token}")
        if source_url.startswith("/"):
            source_url = "https://www.yad2.co.il" + source_url

        if not price and rooms is None and not images:
            return None

        return {
            "source":           "yad2",
            "source_id":        str(token),
            "source_url":       source_url,
            "deal_type":        deal_type,
            "price":            price,
            "city":             city,
            "street":           street,
            "size_m2":          size_m2,
            "rooms":            rooms,
            "floor":            floor,
            "description":      desc,
            "images":           images,
            "is_active":        True,
            "lat":              lat,
            "lng":              lng,
            "parking":          _bool_flag(ad.get("parking")),
            "elevator":         _bool_flag(ad.get("elevator")),
            "balcony":          _bool_flag(ad.get("balcony")),
            "mamad":            _bool_flag(ad.get("shelter") or ad.get("safeRoom")),
            "furnished":        _bool_flag(ad.get("furniture") or ad.get("furnished")),
            "air_conditioning": _bool_flag(ad.get("air_conditioner")),
            "scraped_at":       datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        log(f"Parse error: {e}")
        return None


# ── Scrape one city ───────────────────────────────────────────────────────────
async def scrape_city(
    browser,
    http_client: httpx.AsyncClient,
    existing_urls: set[str],
    city_name: str,
    city_id: int,
    area_id: int,
    region_id: int,
    max_pages: int,
) -> int:
    new_count = 0
    ctx = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1440, "height": 900},
        locale="he-IL",
        extra_http_headers={"Accept-Language": "he-IL,he;q=0.9"},
    )
    try:
        for deal_url, deal_type in DEAL_TYPES:
            log(f"  → {city_name}/{deal_url}")

            base_url = f"https://www.yad2.co.il/realestate/{deal_url}?city={city_id}"
            if area_id:
                base_url += f"&topArea={region_id}&area={area_id}"

            all_markers: list[dict] = []
            seen_ids:    set        = set()
            total_pages             = max_pages

            for page_num in range(1, max_pages + 1):
                if page_num > total_pages:
                    break

                url            = base_url + (f"&page={page_num}" if page_num > 1 else "")
                page_collected: list = []

                page = await ctx.new_page()
                await apply_stealth(page)

                async def handle_response(response, _pn=page_num):
                    rurl = response.url
                    ct   = response.headers.get("content-type", "")
                    if "json" not in ct:
                        return
                    if ("realestate-feed" not in rurl and "feed" not in rurl
                            and "realestate" not in rurl):
                        return
                    try:
                        body = await response.json()
                    except Exception:
                        return
                    data = body.get("data") if isinstance(body, dict) else body
                    if not isinstance(data, dict):
                        return
                    items: list = []
                    for key in ("markers", "yad1Markers", "feed", "items",
                                "listings", "list", "results",
                                "private", "agency", "platinum"):
                        val = data.get(key, [])
                        if isinstance(val, list):
                            items.extend(val)
                        elif isinstance(val, dict):
                            for subkey in ("private", "agency", "platinum",
                                           "markers", "items"):
                                sub = val.get(subkey, [])
                                if isinstance(sub, list):
                                    items.extend(sub)
                    if items:
                        page_collected.extend(items)

                page.on("response", handle_response)
                try:
                    await page.goto(url, timeout=90_000, wait_until="domcontentloaded")
                except Exception as e:
                    log(f"  Page load warning ({city_name} p{page_num}): {type(e).__name__}")

                # Check for ShieldSquare/captcha
                try:
                    title = await page.title()
                    if "captcha" in title.lower() or "shieldsquare" in title.lower():
                        log(f"  [CAPTCHA] {city_name} p{page_num} - skipping city")
                        await page.close()
                        break
                except Exception:
                    pass

                await asyncio.sleep(8)

                # Fallback: read __NEXT_DATA__ for SSR-rendered feed items
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
                            server_total = int(pagination.get("totalPages", max_pages))
                            total_pages  = min(server_total, max_pages)
                            log(f"  {city_name}: {server_total} server pages → scraping {total_pages}")

                        if isinstance(feed, dict):
                            extra: list = []
                            for fkey in ("private", "agency", "platinum",
                                         "markers", "items", "list", "results"):
                                val = feed.get(fkey)
                                if isinstance(val, list):
                                    extra.extend(val)
                            page_collected.extend(extra)
                except Exception as e:
                    log(f"  __NEXT_DATA__ error (p{page_num}): {e}")

                page.remove_listener("response", handle_response)
                await page.close()

                new_in_page = 0
                for m in page_collected:
                    if not isinstance(m, dict):
                        continue
                    mid = (m.get("token") or m.get("id") or
                           m.get("orderId") or m.get("order_id") or
                           m.get("listing_id") or m.get("adId"))
                    if mid and mid not in seen_ids:
                        seen_ids.add(mid)
                        all_markers.append(m)
                        new_in_page += 1

                log(f"  p{page_num}/{total_pages}: {new_in_page} new raw (total {len(all_markers)})")
                if new_in_page == 0 and page_num > 1:
                    break

                if page_num < total_pages:
                    await asyncio.sleep(random.uniform(2, 4))

            # Batch upsert collected markers
            batch = []
            for marker in all_markers:
                row = parse_marker(marker, deal_type)
                if not row or row["source_url"] in existing_urls:
                    continue
                existing_urls.add(row["source_url"])
                batch.append(row)
            if batch:
                saved = await upsert_batch(http_client, batch)
                new_count += saved
                log(f"  ✓ {city_name}/{deal_type}: {saved} new saved")

            await asyncio.sleep(random.uniform(1, 2))

    finally:
        await ctx.close()

    return new_count


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Yad2 Playwright Scraper starting")
    log(f"Cities: {len(CITIES)} | max_pages={MAX_PAGES} | concurrency={CONCURRENCY}")
    log("=" * 60)

    async with httpx.AsyncClient(timeout=30) as http_client:
        existing = await preload_existing_urls(http_client)
        sem      = asyncio.Semaphore(CONCURRENCY)

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )

            async def do_city(city_name, city_id, area_id, region_id) -> int:
                async with sem:
                    try:
                        return await scrape_city(
                            browser, http_client, existing,
                            city_name, city_id, area_id, region_id, MAX_PAGES,
                        )
                    except Exception as e:
                        log(f"City error {city_name}: {e}")
                        return 0

            results   = await asyncio.gather(*[
                do_city(n, cid, aid, rid) for n, cid, aid, rid in CITIES
            ])
            total_new = sum(results)
            await browser.close()

    log("=" * 60)
    log(f"DONE - {total_new} new Yad2 listings saved via Playwright")
    log("=" * 60)
    ping_dead_man("yad2_playwright")


if __name__ == "__main__":
    asyncio.run(main())
