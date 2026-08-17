"""
BebKey - Facebook Marketplace scraper (Playwright, cookie session).

Facebook Marketplace property listings (rentals + for-sale) are React/JS-
rendered, so - unlike Groups - there is NO mbasic equivalent.  We drive a
real headless Chromium (Xvfb in CI) with the logged-in account's cookies,
open each Marketplace property category, scroll to lazy-load item cards, and
extract them straight from the DOM.

Reality check (read before debugging a "0 items" run):
  • Requires a valid FACEBOOK_COOKIES session (same secret the Groups scraper
    uses).  Refresh it with scrapers/refresh_fb_cookies.py.
  • Facebook aggressively blocks/limits datacenter IPs (GitHub Actions).  From
    a CI IP, Marketplace may render empty or challenge even with valid cookies.
    Set a residential proxy (WEBSHARE_PROXY_HOST/USER/PASS) to get a real IP -
    this is usually what makes it actually return cards.
  • Marketplace is location-scoped.  With no FB_MARKETPLACE_LOCATIONS set we
    use the account's default location; pass comma-separated Marketplace
    location IDs/slugs (e.g. "111934872167890") to target specific cities.

Env:
  FACEBOOK_COOKIES            - JSON array of cookie objects (required)
  FB_MARKETPLACE_LOCATIONS    - comma-separated FB Marketplace location IDs
                                (optional; default = account location)
  FB_MAX_ITEMS_PER_CATEGORY   - cap per category (default 60)
  FB_MP_SCROLLS               - scroll iterations per category (default 8)
  WEBSHARE_PROXY_HOST/USER/PASS - optional residential proxy (recommended)
  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import asyncio
import json
import os
import random
import re
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright

try:
    from monitoring import init_sentry, ping_dead_man
except Exception:  # monitoring is optional locally
    def init_sentry(*_a, **_k): ...
    def ping_dead_man(*_a, **_k): ...

init_sentry("facebook_marketplace")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

LOG_FILE = os.path.join(os.path.dirname(__file__), "facebook_marketplace_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)
REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}

COOKIES_JSON = os.getenv("FACEBOOK_COOKIES", "")
LOCATIONS    = [x.strip() for x in os.getenv("FB_MARKETPLACE_LOCATIONS", "").split(",") if x.strip()]
MAX_ITEMS    = int(os.getenv("FB_MAX_ITEMS_PER_CATEGORY", "60"))
SCROLLS      = int(os.getenv("FB_MP_SCROLLS", "8"))

# Residential proxy (recommended for FB from CI). Same vars as the other PW scrapers.
WS_HOST = os.getenv("WEBSHARE_PROXY_HOST", "")
WS_USER = os.getenv("WEBSHARE_PROXY_USER", "")
WS_PASS = os.getenv("WEBSHARE_PROXY_PASS", "")
PROXY_CFG = (
    {"server": f"http://{WS_HOST}", "username": WS_USER, "password": WS_PASS}
    if WS_HOST and WS_USER else None
)

# (category slug, deal_type)
CATEGORIES = [
    ("propertyforsale", "forsale"),
    ("propertyrentals", "rent"),
]


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ── Parsing ───────────────────────────────────────────────────────────────────
# ₪3,200 / 3,200 ₪ / 3200 שח / 1.5 מיליון / NIS 3200
PRICE_RE = re.compile(
    r"(?:₪|ניס|nis|ש\"?ח)?\s*([\d,]{3,})\s*(?:₪|ניס|nis|ש\"?ח)?"
    r"|([\d.]+)\s*(?:מיליון|million)",
    re.I,
)
ROOMS_RE = re.compile(r"(\d+(?:\.\d)?)\s*(?:bed(?:room)?s?|rooms?|חדר(?:ים)?)", re.I)
SIZE_RE  = re.compile(r"(\d{2,4})\s*(?:m²|sqm|sq\.?\s?m|מ[\"״']?ר|מטר)", re.I)


def _parse_price(text: str) -> int | None:
    for m in PRICE_RE.finditer(text):
        if m.group(2):
            try:
                return int(float(m.group(2).replace(",", ".")) * 1_000_000)
            except ValueError:
                pass
        elif m.group(1):
            try:
                v = int(m.group(1).replace(",", ""))
                if 500 < v < 50_000_000:
                    return v
            except ValueError:
                pass
    return None


def parse_marketplace_item(item: dict, deal_type: str) -> dict | None:
    """Turn an extracted Marketplace card into a listings row.  deal_type is
    KNOWN from the category we scraped (cards rarely state rent/sale)."""
    text = (item.get("text") or "").strip()
    if len(text) < 4:
        return None

    price = _parse_price(text)

    rooms = None
    m = ROOMS_RE.search(text)
    if m:
        try:
            r = float(m.group(1))
            rooms = r if 1 <= r <= 20 else None
        except ValueError:
            pass

    size_m2 = None
    m = SIZE_RE.search(text)
    if m:
        try:
            size_m2 = float(m.group(1))
        except ValueError:
            pass

    # City: Marketplace cards put the location on the last line, e.g.
    # "Tel Aviv-Yafo, Israel" / "תל אביב יפו, ישראל".
    city = None
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines:
        last = re.sub(r",?\s*(israel|ישראל)\s*$", "", lines[-1], flags=re.I).strip()
        city = (last.split(",")[0].strip() or None)
        if city and (len(city) > 30 or any(ch.isdigit() for ch in city)):
            city = None  # not a city line (probably price/desc)

    # Reject non-Israeli listings. The dummy account's default Marketplace
    # location can be abroad — it was polluting the DB with US Bay Area cities
    # (Oakland, Berkeley, San Francisco …). Keep only items that read as Israel:
    # a Hebrew city name, or an explicit Israel marker on the location line.
    # (Israeli Marketplace cities come through in Hebrew; the foreign ones are
    # Latin-named.)  Set FB_MARKETPLACE_LOCATIONS to Israeli location IDs to
    # actually pull Israeli inventory.
    loc_line = lines[-1] if lines else ""
    if not (re.search(r"[֐-׿]", city or "")
            or re.search(r"israel|ישראל", loc_line, re.I)):
        return None

    if not price and rooms is None:
        return None

    return {
        "source":      "facebook",
        "source_id":   item["id"],
        "source_url":  item["href"],
        "deal_type":   deal_type,
        "price":       price,
        "city":        city,
        "rooms":       rooms,
        "size_m2":     size_m2,
        "description": text[:800] or None,
        "images":      [item["img"]] if item.get("img") else [],
        "is_active":   True,
        "scraped_at":  datetime.now(timezone.utc).isoformat(),
    }


# ── Supabase ──────────────────────────────────────────────────────────────────
async def preload_existing_urls() -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{REST_URL}/listings",
                    headers={**SB_HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.facebook",
                            "is_active": "eq.true", "limit": limit, "offset": offset},
                )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                existing.update(x["source_url"] for x in rows if x.get("source_url"))
                if len(rows) < limit:
                    break
                offset += limit
            except Exception as e:
                log(f"Preload error: {e}")
                break
    log(f"Preloaded {len(existing)} existing Facebook URLs")
    return existing


async def upsert_batch(rows: list[dict]) -> int:
    if not rows:
        return 0
    try:
        async with httpx.AsyncClient(timeout=30) as sb:
            r = await sb.post(
                f"{REST_URL}/listings?on_conflict=source_url",
                headers=SB_HEADERS,
                content=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
            )
        if r.status_code in (200, 201):
            return len(rows)
        log(f"  ⚠ Supabase upsert {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log(f"  ⚠ upsert error: {e}")
    return 0


# ── Browser extraction ────────────────────────────────────────────────────────
# Pull every Marketplace item card on the page: the /marketplace/item/<id> link,
# its visible text (price + title + location), and its thumbnail.
EXTRACT_JS = """
() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('a[href*="/marketplace/item/"]').forEach(a => {
    const m = a.getAttribute('href').match(/\\/marketplace\\/item\\/(\\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);
    const img = a.querySelector('img');
    out.push({
      id,
      href: 'https://www.facebook.com/marketplace/item/' + id,
      text: (a.innerText || '').trim(),
      img: img ? img.src : null,
    });
  });
  return out;
}
"""


async def validate_session(page) -> bool:
    try:
        await page.goto("https://www.facebook.com/me", timeout=45_000,
                        wait_until="domcontentloaded")
        await asyncio.sleep(2)
        url = page.url
        if "login" in url or "checkpoint" in url:
            log("⚠ Facebook session invalid - redirected to login/checkpoint")
            return False
        log("✓ Facebook session valid")
        return True
    except Exception as e:
        log(f"⚠ Session check error: {e}")
        return False


async def scrape_category(page, existing: set, location: str,
                          category: str, deal_type: str) -> int:
    slug = f"{location}/{category}" if location else f"category/{category}"
    url  = f"https://www.facebook.com/marketplace/{slug}?sortBy=creation_time_descend"
    loc_label = location or "default"
    try:
        await page.goto(url, timeout=35_000, wait_until="domcontentloaded")
    except Exception as e:
        log(f"  ✗ {category}@{loc_label}: goto failed: {e}")
        return 0
    # Proceed the instant item cards render (cap ~6s) rather than a fixed sleep.
    try:
        await page.wait_for_selector('a[href*="/marketplace/item/"]', timeout=6_000)
    except Exception:
        await asyncio.sleep(random.uniform(1.5, 3))

    # Lazy-load: scroll and re-extract each pass, accumulating cards. This both
    # early-stops when a scroll surfaces nothing new (feed exhausted) AND is
    # robust to Marketplace virtualizing (dropping) off-screen cards from the
    # DOM — a single extract-at-the-end would lose those.
    collected: dict = {}
    stale = 0
    for _ in range(SCROLLS):
        try:
            batch = await page.evaluate(EXTRACT_JS)
        except Exception as e:
            log(f"  ✗ {category}@{loc_label}: extract failed: {e}")
            break
        before = len(collected)
        for it in batch:
            collected.setdefault(it["id"], it)
        if len(collected) >= MAX_ITEMS * 3:
            break
        if len(collected) == before:
            stale += 1
            if stale >= 2:
                break
        else:
            stale = 0
        try:
            await page.mouse.wheel(0, 4200)
        except Exception:
            break
        await asyncio.sleep(random.uniform(1.2, 2.4))
    items = list(collected.values())

    log(f"  {category}@{loc_label}: {len(items)} item cards on page")
    if not items:
        # Diagnose: what did FB actually serve? (login wall / location prompt /
        # different DOM / mobile redirect). Drives the selector iteration.
        try:
            diag = await page.evaluate("""() => {
                const t = document.body ? document.body.innerText : '';
                return {
                    url: location.href,
                    title: document.title,
                    anchors: document.querySelectorAll('a').length,
                    mp: document.querySelectorAll('a[href*="/marketplace/"]').length,
                    item: document.querySelectorAll('a[href*="/marketplace/item/"]').length,
                    itemHref: document.querySelectorAll('a[href*="/item/"]').length,
                    loginWall: /log in|log into|התחבר|הירשם|create new account/i.test(t.slice(0, 4000)),
                    sample: t.replace(/\\s+/g, ' ').slice(0, 350),
                };
            }""")
            log(f"  DIAG {category}@{loc_label}: {json.dumps(diag, ensure_ascii=False)[:600]}")
        except Exception as e:
            log(f"  DIAG failed: {e}")
        return 0

    rows, stats = [], {"dupe": 0, "parse_none": 0, "ok": 0}
    for it in items[: MAX_ITEMS * 3]:  # extra headroom; parse filters non-listings
        if it["href"] in existing:
            stats["dupe"] += 1
            continue
        row = parse_marketplace_item(it, deal_type)
        if not row:
            stats["parse_none"] += 1
            continue
        existing.add(row["source_url"])
        rows.append(row)
        stats["ok"] += 1
        if len(rows) >= MAX_ITEMS:
            break

    saved = await upsert_batch(rows)
    log(f"  {category}@{loc_label}: {saved} new "
        f"(ok={stats['ok']} dupe={stats['dupe']} parse_none={stats['parse_none']})")
    return saved


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Facebook Marketplace scraper starting")
    if not COOKIES_JSON:
        log("FACEBOOK_COOKIES not set - skipping (set up account first)")
        return
    try:
        cookies = json.loads(COOKIES_JSON)
        if not isinstance(cookies, list):
            log("ERROR: FACEBOOK_COOKIES must be a JSON array"); return
    except json.JSONDecodeError as e:
        log(f"ERROR: FACEBOOK_COOKIES invalid JSON: {e}"); return

    locations = LOCATIONS or [""]   # "" → account default location
    log(f"Cookies: {len(cookies)} | locations: {len(locations)} | "
        f"categories: {len(CATEGORIES)} | proxy: {'yes' if PROXY_CFG else 'no'}")
    log("=" * 60)

    existing = await preload_existing_urls()

    pw_cookies = []
    for c in cookies:
        try:
            pw_cookies.append({
                "name": c["name"], "value": c["value"],
                "domain": c.get("domain", ".facebook.com"),
                "path": c.get("path", "/"), "secure": c.get("secure", True),
                "httpOnly": c.get("httpOnly", False),
            })
        except (KeyError, TypeError):
            pass

    async with async_playwright() as p:
        async def open_session(with_proxy: bool):
            launch_kwargs = dict(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage",
                      "--disable-blink-features=AutomationControlled",
                      "--disable-notifications"],
            )
            if with_proxy and PROXY_CFG:
                launch_kwargs["proxy"] = PROXY_CFG
            browser = await p.chromium.launch(**launch_kwargs)
            # Desktop UA/viewport: Marketplace's desktop web renders the standard
            # grid of a[href*="/marketplace/item/"] cards; the mobile/iPhone
            # layout serves a stripped React view without those anchors.
            ctx = await browser.new_context(
                user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/137.0.0.0 Safari/537.36"),
                viewport={"width": 1366, "height": 900},
                locale="he-IL",
            )
            await ctx.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>false});"
                "Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3]});"
            )
            await ctx.add_cookies(pw_cookies)
            # Save residential-proxy bandwidth: never download images/media/fonts
            # (we only extract links + text from the DOM). Cuts transfer ~80%+.
            async def _block_heavy(route):
                if route.request.resource_type in ("image", "media", "font"):
                    await route.abort()
                else:
                    await route.continue_()
            await ctx.route("**/*", _block_heavy)
            pg = await ctx.new_page()
            ok = await validate_session(pg)
            return browser, pg, ok

        log(f"Injected {len(pw_cookies)} cookies")
        browser, page, ok = await open_session(with_proxy=bool(PROXY_CFG))
        # The proxy can be down (502s) even with valid cookies → fall back to a
        # direct connection so a dead proxy never blocks the run.
        if not ok and PROXY_CFG:
            log("Proxy session failed — retrying WITHOUT proxy (proxy may be down)")
            await browser.close()
            browser, page, ok = await open_session(with_proxy=False)
        if not ok:
            log("Session invalid (even direct) - aborting. Refresh FACEBOOK_COOKIES.")
            await browser.close()
            return

        total = 0
        for location in locations:
            for category, deal_type in CATEGORIES:
                total += await scrape_category(page, existing, location,
                                               category, deal_type)
                await asyncio.sleep(random.uniform(8, 16))  # look human

        await page.close()
        await browser.close()

    log("=" * 60)
    log(f"DONE - {total} new Facebook Marketplace listings saved")
    log("=" * 60)
    ping_dead_man("facebook_marketplace")


if __name__ == "__main__":
    asyncio.run(main())
