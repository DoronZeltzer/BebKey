"""
BebKey - Madlan Playwright Scraper (no Apify, runs free on GitHub Actions)

Uses Playwright headless Chromium to visit Madlan listing pages and
intercepts the /api2 / /api3 GraphQL responses.  No proxy required -
datacenter IPs (both GitHub Actions and Apify server) bypass PerimeterX
because they look like clean cloud servers, not residential proxies.

Env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MADLAN_MAX_SCROLLS   (default 5 per city/deal)
  MADLAN_CONCURRENCY   (default 3)
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

# playwright-stealth patches ~30 Playwright fingerprints (canvas, WebGL,
# audio, plugins, hardware concurrency, screen size, etc.) that
# PerimeterX checks.  Our hand-rolled STEALTH_JS only hides
# navigator.webdriver - modern PerimeterX sees through that in one ping.
try:
    from playwright_stealth import stealth_async  # type: ignore
    _HAS_STEALTH_LIB = True
except ImportError:
    _HAS_STEALTH_LIB = False

init_sentry("madlan_playwright")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "madlan_playwright_log.txt")

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

MAX_SCROLLS = int(os.getenv("MADLAN_MAX_SCROLLS", "5"))
CONCURRENCY = int(os.getenv("MADLAN_CONCURRENCY", "3"))

# ── Proxy (Apify residential) ────────────────────────────────────────────────
# Madlan's PerimeterX bumped detection in mid-May 2026.  Free playwright-
# stealth + the human-dwell warmup still gets blocked from GitHub Actions
# datacenter IPs.  Routing through Webshare residential proxy bypasses
# the block.
#
# Priority:
#   1. MADLAN_PROXY_URL    - custom proxy (any http://user:pass@host:port)
#   2. WEBSHARE_PROXY_*    - Webshare residential (IL, sticky session)
#   3. None                - fall through to the (currently blocked) direct path
MADLAN_PROXY_URL   = os.getenv("MADLAN_PROXY_URL", "")
WS_PROXY_HOST      = os.getenv("WEBSHARE_PROXY_HOST", "")
WS_PROXY_USER      = os.getenv("WEBSHARE_PROXY_USER", "")
WS_PROXY_PASS      = os.getenv("WEBSHARE_PROXY_PASS", "")

def _build_proxy_cfg() -> dict | None:
    if MADLAN_PROXY_URL:
        import urllib.parse
        parsed = urllib.parse.urlparse(MADLAN_PROXY_URL)
        cfg = {"server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"}
        if parsed.username:
            cfg["username"] = urllib.parse.unquote(parsed.username)
        if parsed.password:
            cfg["password"] = urllib.parse.unquote(parsed.password)
        return cfg
    if WS_PROXY_HOST and WS_PROXY_USER and WS_PROXY_PASS:
        return {
            "server":   f"http://{WS_PROXY_HOST}",
            "username": WS_PROXY_USER,
            "password": WS_PROXY_PASS,
        }
    return None

MADLAN_PROXY_CFG = _build_proxy_cfg()

DEAL_TYPES = [("unitBuy", "for-sale", "forsale"), ("unitRent", "for-rent", "rent")]

# ── City list (matches apify-actors/madlan) ───────────────────────────────────
def _slug(name: str) -> str:
    return name.replace(" ", "-") + "-ישראל"

_HEBREW_CITIES = [
    # Tel Aviv & Gush Dan
    "תל אביב יפו", "רמת גן", "גבעתיים", "בני ברק", "חולון", "בת ים",
    "רמת השרון", "הרצליה", "פתח תקוה", "ראשון לציון", "רחובות", "נס ציונה",
    "קריית אונו", "יהוד", "אור יהודה", "גני תקווה", "גבעת שמואל", "אזור",
    # Sharon
    "רעננה", "כפר סבא", "הוד השרון", "ראש העין", "נתניה", "אבן יהודה",
    "תל מונד", "קדימה צורן", "חדרה", "פרדס חנה כרכור", "בנימינה גבעת עדה",
    "זכרון יעקב", "קיסריה", "אור עקיבא", "חריש", "פרדסיה", "כפר יונה",
    "בית דגן", "שוהם", "אלעד",
    # Shfela / Jerusalem corridor
    "לוד", "רמלה", "באר יעקב", "מזכרת בתיה", "גדרה", "יבנה", "גן יבנה",
    "מודיעין מכבים רעות", "בית שמש", "ירושלים", "מבשרת ציון", "גבעת זאב",
    "מעלה אדומים", "ביתר עילית", "אפרת", "מודיעין עילית", "קריית ארבע",
    "אריאל",
    # Haifa & Krayot
    "חיפה", "קריית אתא", "קריית ביאליק", "קריית מוצקין", "קריית ים", "נשר",
    "טירת כרמל", "יקנעם עילית", "נהריה", "עכו", "כרמיאל", "מעלות תרשיחא",
    "שלומי",
    # North / Galilee
    "נצרת", "נוף הגליל", "עפולה", "טבריה", "צפת", "קריית שמונה",
    "מגדל העמק", "בית שאן", "חצור הגלילית",
    # Arab towns
    "אום אל פחם", "טייבה", "טירה", "שפרעם", "סח'נין", "טמרה", "מגאר",
    "כפר כנא", "ערערה", "באקה אל גרבייה", "רהט",
    # South / Negev
    "באר שבע", "דימונה", "ערד", "מצפה רמון", "אילת", "ירוחם", "אופקים",
    "נתיבות", "שדרות", "אשקלון", "אשדוד", "קריית מלאכי", "קריית גת",
]

FALLBACK_CITIES = [(name, _slug(name)) for name in _HEBREW_CITIES]

# ── Stealth JS (mask webdriver fingerprint) ───────────────────────────────────
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

BLOCK_SIGNALS = ["sorry a1", "px-captcha", "access denied", "perimeterx", "px.gif"]

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def is_block(text: str) -> bool:
    lo = text.lower()
    return any(s in lo for s in BLOCK_SIGNALS)


async def apply_stealth(page) -> None:
    # Two layers: playwright-stealth's comprehensive patch + our own
    # webdriver/plugins fallback.  playwright-stealth covers what we
    # missed (canvas/WebGL/audio fingerprint, hardware concurrency,
    # screen.{availWidth,availHeight}, deviceMemory, permission API,
    # etc.).  Order matters: stealth_async first, then add_init_script
    # so our patches override anything stealth-lib didn't override.
    if _HAS_STEALTH_LIB:
        try:
            await stealth_async(page)
        except Exception as e:
            log(f"playwright-stealth failed: {e}")
    await page.add_init_script(STEALTH_JS)


# ── City list (try Madlan API first, fall back to hard-coded list) ────────────
async def fetch_cities() -> list[tuple[str, str]]:
    headers = {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept":          "application/json",
        "Accept-Language": "he-IL,he;q=0.9",
    }
    try:
        async with httpx.AsyncClient(headers=headers, timeout=15) as c:
            r = await c.get(
                "https://www.madlan.co.il/api/autocomplete?q=&type=area&limit=2000"
            )
            if r.status_code == 200:
                data  = r.json()
                items = data if isinstance(data, list) else data.get("data", [])
                cities = [
                    (item.get("displayName", ""), item.get("docId", ""))
                    for item in items
                    if item.get("docId") and "ישראל" in item.get("docId", "")
                ]
                if cities:
                    log(f"Fetched {len(cities)} cities from Madlan API")
                    return cities
    except Exception as e:
        log(f"City API error: {e}")
    log(f"Using fallback city list ({len(FALLBACK_CITIES)} cities)")
    return FALLBACK_CITIES


# ── Supabase ──────────────────────────────────────────────────────────────────
async def preload_existing_urls(client: httpx.AsyncClient) -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    while True:
        try:
            r = await client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={"select": "source_url", "source": "eq.madlan",
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
    log(f"Preloaded {len(existing)} existing Madlan URLs")
    return existing


async def upsert_batch(client: httpx.AsyncClient, rows: list[dict]) -> int:
    if not rows:
        return 0
    for row in rows:
        enrich(row)
    try:
        r = await client.post(
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


# ── Parse POI ─────────────────────────────────────────────────────────────────
def _clean_id(raw) -> str:
    s = str(raw or "")
    for prefix in ("BULLETIN:", "PROJECT:", "bulletin:", "project:"):
        if s.startswith(prefix):
            return s[len(prefix):]
    return s


def _bool_flag(val):
    if val is None: return None
    if isinstance(val, bool): return val
    if isinstance(val, (int, float)): return val > 0
    if isinstance(val, str): return val.lower() not in ("false", "0", "no", "")
    return None


def parse_poi(poi: dict, city_name: str, deal_type: str) -> dict | None:
    try:
        poi_type = poi.get("__typename", "").lower()
        poi_id   = _clean_id(poi.get("id", ""))
        if not poi_id or poi_type not in ("bulletin", "project"):
            return None

        addr        = poi.get("addressDetails") or {}
        city        = addr.get("city") or city_name
        street_name = addr.get("streetName") or ""
        street_num  = addr.get("streetNumber") or ""
        street      = f"{street_name} {street_num}".strip() or None

        lat = lng = None
        coords = poi.get("coordinates") or poi.get("location") or {}
        if isinstance(coords, dict):
            try:
                lat = float(coords.get("lat") or coords.get("latitude") or 0) or None
                lng = float(coords.get("lon") or coords.get("lng") or coords.get("longitude") or 0) or None
            except (ValueError, TypeError):
                pass

        if poi_type == "bulletin":
            price      = poi.get("price")
            rooms      = poi.get("beds") or poi.get("rooms")
            size_m2    = poi.get("area") or poi.get("squareMeter")
            floor      = poi.get("floor")
            desc       = (poi.get("description") or poi.get("text") or "").strip() or None
            raw_imgs   = poi.get("images") or []
            images     = [img.get("imageUrl") or img.get("url") for img in raw_imgs
                          if isinstance(img, dict) and not img.get("isFloorplan")]
            images     = [u for u in images if u][:10]
            source_url = poi.get("url") or f"https://www.madlan.co.il/listing/{poi_id}"
        elif poi_type == "project":
            pr         = poi.get("priceRange") or {}
            price      = pr.get("min") or pr.get("max")
            br         = poi.get("bedsRange") or {}
            rooms      = br.get("min")
            size_m2    = None
            floor      = None
            desc       = (poi.get("description") or "").strip() or None
            raw_imgs   = poi.get("images") or []
            images     = [img.get("path") or img.get("url") for img in raw_imgs
                          if isinstance(img, dict)]
            images     = [u for u in images if u][:10]
            source_url = poi.get("url") or f"https://www.madlan.co.il/project/{poi_id}"
        else:
            return None

        if price is None and rooms is None and not images:
            return None

        price_int = int(price) if price else None
        if price_int and price_int > 50_000_000:
            return None

        rooms_f = float(rooms) if rooms else None
        if rooms_f and (rooms_f < 1 or rooms_f > 20):
            rooms_f = None

        if source_url and source_url.startswith("/"):
            source_url = "https://www.madlan.co.il" + source_url

        return {
            "source":           "madlan",
            "source_id":        poi_id,
            "source_url":       source_url,
            "deal_type":        deal_type,
            "price":            price_int,
            "city":             city,
            "street":           street,
            "size_m2":          float(size_m2) if size_m2 else None,
            "rooms":            rooms_f,
            "floor":            int(floor) if floor is not None else None,
            "description":      desc,
            "images":           images,
            "is_active":        True,
            "lat":              lat,
            "lng":              lng,
            "parking":          _bool_flag(poi.get("parking")),
            "elevator":         _bool_flag(poi.get("elevator")),
            "balcony":          _bool_flag(poi.get("balcony")),
            "mamad":            _bool_flag(poi.get("safeRoom") or poi.get("mamad")),
            "furnished":        _bool_flag(poi.get("furnished")),
            "air_conditioning": _bool_flag(poi.get("airConditioning")),
            "scraped_at":       datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        log(f"Parse error {poi.get('id', '?')}: {e}")
        return None


# ── Scroll helper ─────────────────────────────────────────────────────────────
async def scroll_page(page, times: int = 3) -> None:
    for _ in range(times):
        await page.evaluate("""() => {
            const el = [...document.querySelectorAll('div')]
                .filter(d => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 400)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            if (el) el.scrollTop += 3000; else window.scrollBy(0, 3000);
        }""")
        await asyncio.sleep(random.uniform(1.5, 2.5))


# ── Warmup ────────────────────────────────────────────────────────────────────
async def _human_dwell(page, total_ms: int = 8000) -> None:
    """Simulate a human reading the page - random mouse moves + scrolls
    over `total_ms` milliseconds.  PerimeterX's behavioural classifier
    weights this heavily; sitting completely still on the homepage for
    8 seconds is a fingerprint of a bot."""
    end = asyncio.get_event_loop().time() + total_ms / 1000
    while asyncio.get_event_loop().time() < end:
        # Random mouse coordinates within the viewport
        x = random.randint(50, 1300)
        y = random.randint(50, 700)
        try:
            await page.mouse.move(x, y, steps=random.randint(8, 20))
        except Exception:
            pass
        # Occasional scroll
        if random.random() < 0.4:
            try:
                await page.mouse.wheel(0, random.randint(150, 600))
            except Exception:
                pass
        await asyncio.sleep(random.uniform(0.4, 1.2))

async def warmup(browser, attempt: int = 1) -> bool:
    log(f"Warming up browser on madlan.co.il... "
        f"(attempt {attempt}, proxy={'apify' if MADLAN_PROXY_CFG else 'none'})")
    ctx_kwargs = dict(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1366, "height": 768},
        locale="he-IL",
        # PerimeterX cross-checks the browser timezone against the IP's geo.
        # The Webshare exit is an Israeli residential IP, so the browser MUST
        # report Asia/Jerusalem or the mismatch is an instant bot flag.
        timezone_id="Asia/Jerusalem",
        extra_http_headers={
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            "sec-ch-ua": '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
        },
    )
    if MADLAN_PROXY_CFG:
        ctx_kwargs["proxy"] = MADLAN_PROXY_CFG
    ctx = await browser.new_context(**ctx_kwargs)
    page = await ctx.new_page()
    await apply_stealth(page)
    try:
        resp = await page.goto(
            "https://www.madlan.co.il/", timeout=90_000, wait_until="domcontentloaded"
        )
        # Human dwell - variable time + mouse movement + scrolling
        await _human_dwell(page, total_ms=random.randint(7000, 11000))

        if resp and resp.status in (403, 429):
            body = await resp.text()
            if is_block(body):
                log(f"Warmup: PerimeterX block detected (HTTP {resp.status})")
                return False

        # Sniff the rendered DOM in case PX renders the challenge as a 200
        try:
            html_now = await page.content()
            if is_block(html_now):
                log("Warmup: PerimeterX challenge in DOM body")
                return False
        except Exception:
            pass

    except Exception as e:
        log(f"Warmup error: {e}")
        return False
    finally:
        await page.close()
        await ctx.close()
    log("Warmup complete")
    return True


async def warmup_with_retry(browser, max_attempts: int = 3) -> bool:
    """Retry warmup up to `max_attempts` times with backoff.  PerimeterX
    sometimes serves a soft block on first contact then lets the next
    request through if the second one looks more 'human'."""
    for attempt in range(1, max_attempts + 1):
        ok = await warmup(browser, attempt=attempt)
        if ok:
            return True
        if attempt < max_attempts:
            backoff = random.uniform(15, 30) * attempt
            log(f"Warmup attempt {attempt} failed - sleeping {backoff:.1f}s before retry")
            await asyncio.sleep(backoff)
    return False


# ── Scrape one city ───────────────────────────────────────────────────────────
async def scrape_city(
    browser,
    http_client: httpx.AsyncClient,
    existing_urls: set[str],
    city_name: str,
    city_slug: str,
    max_scrolls: int,
) -> int:
    new_count = 0
    ctx_kwargs = dict(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1366, "height": 768},
        locale="he-IL",
        timezone_id="Asia/Jerusalem",
        extra_http_headers={
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            "sec-ch-ua": '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
        },
    )
    if MADLAN_PROXY_CFG:
        ctx_kwargs["proxy"] = MADLAN_PROXY_CFG
    ctx = await browser.new_context(**ctx_kwargs)
    try:
        for _, deal_url_slug, deal_type in DEAL_TYPES:
            captured: list[dict] = []
            seen_ids: set        = set()
            blocked              = False

            async def on_response(response, _dt=deal_type):
                nonlocal blocked
                if not any(p in response.url for p in ("/api2", "/api3", "/api/", "/graphql")):
                    return
                ct = response.headers.get("content-type", "")
                if "json" not in ct:
                    try:
                        t = await response.text()
                        if is_block(t):
                            blocked = True
                    except Exception:
                        pass
                    return
                try:
                    body_text = await response.text()
                    if is_block(body_text):
                        blocked = True
                        return
                    body = json.loads(body_text)
                except Exception:
                    return
                data = body.get("data") or {}
                for op in ["searchPoiV2", "searchPoi", "searchPoiForRent",
                           "searchBulletins"]:
                    sd   = data.get(op) or {}
                    pois = sd.get("poi") or sd.get("bulletins") or []
                    if pois:
                        for poi in pois:
                            pid = poi.get("id")
                            if pid and pid not in seen_ids:
                                seen_ids.add(pid)
                                captured.append(poi)
                        break

            page = await ctx.new_page()
            await apply_stealth(page)
            page.on("response", on_response)

            url = f"https://www.madlan.co.il/{deal_url_slug}/{city_slug}"
            log(f"  → {city_name}/{deal_url_slug}")
            try:
                resp = await page.goto(url, timeout=90_000, wait_until="domcontentloaded")
                if resp:
                    try:
                        t = await resp.text()
                        if is_block(t):
                            blocked = True
                    except Exception:
                        pass
                await asyncio.sleep(5)
                if not blocked:
                    for _ in range(max_scrolls):
                        before = len(captured)
                        await scroll_page(page, times=3)
                        await asyncio.sleep(2)
                        if len(captured) == before:
                            break
            except Exception as e:
                log(f"  Page error {city_name}/{deal_url_slug}: {e}")
            finally:
                page.remove_listener("response", on_response)
                await page.close()

            if blocked:
                log(f"  [BLOCK] {city_name}/{deal_url_slug}")
            else:
                batch = []
                for poi in captured:
                    row = parse_poi(poi, city_name, deal_type)
                    if not row or row["source_url"] in existing_urls:
                        continue
                    existing_urls.add(row["source_url"])
                    batch.append(row)
                if batch:
                    saved = await upsert_batch(http_client, batch)
                    new_count += saved
                    log(f"  ✓ {city_name}/{deal_type}: {saved} new (of {len(captured)} raw)")

            await asyncio.sleep(random.uniform(1, 2))

    finally:
        await ctx.close()

    return new_count


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Madlan Playwright Scraper starting")
    log(f"max_scrolls={MAX_SCROLLS} | concurrency={CONCURRENCY}")
    log("=" * 60)

    async with httpx.AsyncClient(timeout=30) as http_client:
        existing   = await preload_existing_urls(http_client)
        cities     = await fetch_cities()
        sem        = asyncio.Semaphore(CONCURRENCY)
        total_new  = 0

        async with async_playwright() as p:
            # headful=False under xvfb-run: PerimeterX trivially fingerprints
            # headless Chromium (the homepage warms up but the data API returns
            # nothing). The workflow runs this under xvfb-run with DISPLAY=:99
            # precisely so we can run a REAL (headful) browser on a virtual
            # display, which is far harder to detect.
            browser = await p.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            ok = await warmup_with_retry(browser, max_attempts=3)
            if not ok:
                await browser.close()
                log("=" * 60)
                log("DONE - 0 new Madlan listings saved (warmup blocked after retries)")
                log("=" * 60)
                ping_dead_man("madlan_playwright")
                return

            async def do_city(name: str, slug: str) -> int:
                async with sem:
                    try:
                        return await scrape_city(
                            browser, http_client, existing, name, slug, MAX_SCROLLS
                        )
                    except Exception as e:
                        log(f"City error {name}: {e}")
                        return 0

            results   = await asyncio.gather(*[do_city(n, s) for n, s in cities])
            total_new = sum(results)
            await browser.close()

    log("=" * 60)
    log(f"DONE - {total_new} new Madlan listings saved")
    log("=" * 60)
    ping_dead_man("madlan_playwright")


if __name__ == "__main__":
    asyncio.run(main())
