"""
BebKey - Janglo.net Real Estate Scraper (Playwright edition)

Janglo is server-side rendered, but GitHub Actions' Azure IP ranges are
blocked by Janglo (returns 200 with no listing links when using plain httpx).
Playwright with headful Chromium (via Xvfb on CI) bypasses this IP block
because the browser presents a full browser fingerprint - not just HTTP headers.

This scraper reuses all the parse logic from janglo_scraper.py but navigates
pages using Playwright instead of httpx.

Run order in scraper.yml: AFTER playwright install + xvfb install steps.
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
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from bs4 import BeautifulSoup
from quality import enrich
from city_normalize import normalize_city

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

BASE_URL    = "https://www.janglo.net"
CATEGORIES  = [
    ("rent",    "/real-estate-rentals"),
    ("forsale", "/real-estate-for-sale"),
]
MAX_PAGES   = int(os.getenv("JANGLO_MAX_PAGES", "30"))
CONCURRENCY = int(os.getenv("JANGLO_CONCURRENCY", "3"))


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Supabase helpers ──────────────────────────────────────────────────────────

async def preload_existing_urls() -> set:
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


async def supabase_upsert_rows(rows: list[dict]) -> int:
    """Batch-upsert rows via a fresh httpx client (no browser headers)."""
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
        log(f"  Supabase upsert {r.status_code}: {r.text[:200]}")
    except Exception as exc:
        log(f"  Supabase upsert error: {exc}")
    return 0


async def refresh_scraped_at(urls: set):
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
                    log(f"  scraped_at PATCH {r.status_code}: {r.text[:100]}")
            except Exception as e:
                log(f"  scraped_at error: {e}")
    log(f"Refreshed scraped_at for {refreshed} Janglo listings")


# ── Parse helpers (reuse logic from janglo_scraper.py) ───────────────────────

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


def parse_detail_page(html: str, source_url: str, deal_type: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")

    title_el = soup.find("h1")
    title_text = title_el.get_text(strip=True) if title_el else ""

    # Price
    price = None
    for span in soup.find_all("span", class_=re.compile(r"nicebreak", re.I)):
        text = span.get_text(strip=True)
        if re.search(r"NIS|₪|\d[\d,]+", text):
            p = _parse_price(text)
            if p:
                price = p
                break
    if not price:
        body = soup.find("body") or soup
        for el in body.find_all(["span", "div", "p", "strong"],
                                string=re.compile(r"(?:NIS|₪)\s*\d|^\d[\d,]+\s*(?:NIS|₪)")):
            p = _parse_price(el.get_text())
            if p and 500 < p < 50_000_000:
                price = p
                break

    # Description - fall through to the full soup if no semantic container
    # is found (fragments and minimally-marked-up pages don't have <body>).
    desc = None
    main_el = (soup.find("main") or soup.find("article") or
               soup.find(class_=re.compile(r"content|body|listing|detail|post", re.I)) or
               soup.find("body") or soup)
    paras = [p.get_text(separator=" ", strip=True)
             for p in main_el.find_all("p")
             if len(p.get_text(strip=True)) > 30]
    if paras:
        desc = " ".join(paras[:3])[:1000]
    # Last-resort: glue together all <p>'s if they're shorter individually
    if not desc:
        short_paras = [p.get_text(separator=" ", strip=True)
                       for p in main_el.find_all("p")
                       if p.get_text(strip=True)]
        joined = " ".join(short_paras)
        if len(joined) > 15:
            desc = joined[:1000]
    if not desc:
        desc = title_text or None

    # City - Janglo posts are mostly English but city naming is
    # inconsistent.  Audit (2026-06) showed only 40% of listings had a
    # city extracted - the old list missed many Jerusalem neighborhoods,
    # Anglo-heavy cities (Efrat, RBS, Maale Adumim), kibbutzim, and
    # common alt-spellings (Bet Shemesh vs Beit Shemesh).  Longer cities
    # are matched first so "Ramat Beit Shemesh" wins over "Beit Shemesh".
    JLM_HOODS = {
        "Katamon", "Rehavia", "Baka", "Ramot", "Talpiot", "Talbiya",
        "Talbieh", "Nachlaot", "Arnona", "Malcha", "Givat Shaul",
        "Sanhedria", "Har Nof", "Pisgat Ze'ev", "German Colony",
        "Abu Tor", "Old City", "City Center", "Nayot", "Gilo",
        "Mekor Haim", "Beit Hakerem", "Kiryat Yovel", "Kiryat Moshe",
        "Mea Shearim", "Geula", "Bayit Vegan", "Nahlaot", "Greek Colony",
        "Mamilla", "Yemin Moshe", "Romema", "Bukharim", "Old Katamon",
        "French Hill", "Ramat Eshkol", "Ma'alot Dafna", "Maalot Dafna",
        "Neve Yaakov", "Ramat Shlomo", "Mishkenot Sha'ananim",
    }
    KNOWN_CITIES = [
        # Anglo-heavy religious cities (high Janglo concentration)
        "Ramat Beit Shemesh", "Beit Shemesh", "Bet Shemesh", "RBS",
        "Maale Adumim", "Ma'ale Adumim", "Maaleh Adumim",
        "Efrat", "Efrata", "Tekoa", "Eli", "Shilo", "Beit El",
        "Modi'in Illit", "Beitar Illit", "Ariel", "Kiryat Arba",
        "Hashmonaim", "Ma'ale Amos", "Neve Daniel", "Alon Shvut",
        # Top cities + variants
        "Jerusalem", "Yerushalayim",
        "Tel Aviv-Yafo", "Tel Aviv", "TLV",
        "Haifa", "Hefa",
        "Beer Sheva", "Be'er Sheva", "Beersheba",
        "Netanya", "Natanya",
        "Rishon LeZion", "Rishon Le Zion", "Rishon",
        "Petah Tikva", "Petach Tikva", "Petah Tikvah", "Petach Tikvah",
        "Ramat Gan", "Givatayim", "Bnei Brak", "Holon", "Bat Yam",
        "Ramat HaSharon", "Ramat Hasharon", "Hod HaSharon", "Hod Hasharon",
        "Kiryat Ono", "Or Yehuda", "Yehud", "Azor", "Givat Shmuel",
        # Modiin region
        "Modi'in-Maccabim-Re'ut", "Modi'in", "Modiin", "Maccabim", "Re'ut",
        # Sharon
        "Herzliya", "Herzliya Pituach", "Ra'anana", "Raanana",
        "Kfar Saba", "Kefar Saba", "Tel Mond", "Even Yehuda",
        "Pardes Hanna", "Pardesia", "Kfar Yona",
        # Ashdod/Ashkelon
        "Ashdod", "Ashkelon", "Ashqelon",
        # Rehovot/Yavne
        "Rehovot", "Ness Ziona", "Nes Ziona", "Rishon", "Yavne",
        "Gan Yavne", "Mazkeret Batya", "Be'er Ya'akov",
        # Krayot
        "Kiryat Bialik", "Kiryat Ata", "Kiryat Motzkin", "Kiryat Yam",
        "Nesher", "Tirat Carmel",
        # North
        "Tiberias", "Tveria", "Safed", "Tzfat", "Zfat",
        "Nazareth", "Karmiel", "Nahariya", "Acre", "Akko",
        "Afula", "Beit She'an", "Migdal HaEmek", "Kiryat Shmona",
        "Yokneam", "Zichron Yaakov", "Zikhron Ya'akov", "Pardes Hanna-Karkur",
        "Hadera", "Caesarea", "Bnei Atarot", "Binyamina", "Or Akiva",
        # Center/South
        "Hashmonaim", "Sderot", "Netivot", "Ofakim", "Kiryat Gat",
        "Kiryat Malachi", "Lod", "Lydda", "Ramla", "Ramleh",
        "Eilat", "Dimona", "Arad", "Mitzpe Ramon",
        # Add JLM hood markers AFTER cities (so a real city wins first)
        *sorted(JLM_HOODS, key=len, reverse=True),
    ]
    # Match longest names first so "Ramat Beit Shemesh" wins over "Beit Shemesh"
    KNOWN_CITIES_SORTED = sorted(set(KNOWN_CITIES), key=len, reverse=True)
    # Search ENTIRE title + first 1500 chars of description, not just 600
    search_text = f"{title_text} {desc or ''}"[:2000].lower()
    city = None
    for c in KNOWN_CITIES_SORTED:
        if c.lower() in search_text:
            city = "Jerusalem" if c in JLM_HOODS else c
            break
    city = normalize_city(city)

    # Rooms - Janglo posts use many formats.  The old regex only caught
    # "3 rooms" / "3 bedrooms" / "3 BR", missing "3-bedroom", "3 bed",
    # "studio (1 BR)", "3+1", "two bedroom", etc.  Audit showed 79% miss.
    rooms = None
    # Word numbers → digits (rough but enough for "two bedroom" etc.)
    WORD_NUMS = {
        "studio": 1.0, "one": 1.0, "two": 2.0, "three": 3.0,
        "four": 4.0, "five": 5.0, "six": 6.0,
    }
    for word, n in WORD_NUMS.items():
        if re.search(rf"\b{word}\b[\s\-]*(?:bed|room|br)", search_text, re.I):
            rooms = n
            break
        if word == "studio" and re.search(r"\bstudio\b", search_text, re.I):
            # Standalone "studio" without room qualifier still = 1.0
            rooms = 1.0
    if rooms is None:
        # Digit forms: "3 rooms", "3-bedroom", "3BR", "2.5 BR", "3 bed"
        m = re.search(
            r"(\d+(?:\.\d+)?)\s*[-\s]?\s*(?:room|bedroom|bed|br)s?\b",
            search_text, re.I,
        )
        if m:
            try:
                rooms = float(m.group(1))
            except ValueError:
                pass
    if rooms is None:
        # "3+1" / "4+1" Israeli room-count notation (rooms + small room)
        m = re.search(r"\b(\d+)\s*\+\s*1\b", search_text)
        if m:
            try:
                rooms = float(m.group(1)) + 0.5  # +1 small room ≈ half-room
            except ValueError:
                pass

    # Size
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

    # Images - fixed 2026-06 after homepage "Just listed today" showed
    # broken thumbnails for every Janglo listing.  Two bugs were here:
    #   1) `BASE_URL + src` smushed paths when src didn't start with `/`
    #      (e.g. "https://www.janglo.net" + "assets/..." = "janglo.netassets/...")
    #      Switched to urljoin which handles both absolute and relative paths.
    #   2) Janglo's listing-detail page contains UI badge images like
    #      /assets/images/comp/forsaleb.png (the green "For Sale" graphic
    #      the user sees in the corner of listing cards).  The scraper
    #      was picking these up as "real" photos.  Now we explicitly skip
    #      anything under /assets/, /comp/, /badges/, /buttons/, /ui/,
    #      and reject the specific known badge filenames.
    from urllib.parse import urljoin
    images = []
    SKIP_PATH_SEGMENTS = ('/assets/', '/comp/', '/badges/', '/buttons/',
                          '/ui/', '/static/icons/', '/sprite')
    SKIP_FILENAMES = ('forsale', 'forrent', 'sold', 'rented', 'logo',
                       'icon', 'avatar', 'banner', 'sprite', 'placeholder')
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue
        if not any(ext in src.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")):
            continue
        low = src.lower()
        # Reject UI graphics by path AND by filename
        if any(seg in low for seg in SKIP_PATH_SEGMENTS):
            continue
        # Filename portion (after last '/')
        fname = low.rsplit('/', 1)[-1]
        if any(skip in fname for skip in SKIP_FILENAMES):
            continue
        # Resolve relative URLs against the listing source_url, not BASE_URL
        # - handles both "/foo.jpg" and "foo.jpg" correctly.
        full = urljoin(source_url, src)
        # Also require the URL to be HTTP(S) - sometimes data: URIs slip through
        if not full.startswith(('http://', 'https://')):
            continue
        if full not in images:
            images.append(full)
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


# ── Playwright page helpers ───────────────────────────────────────────────────

async def get_page_html(page: Page, url: str, wait_ms: int = 2000) -> str:
    """Navigate to url and return the page HTML after network idle."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(wait_ms)
        return await page.content()
    except Exception as e:
        log(f"  Playwright navigation error {url}: {e}")
        return ""


async def scrape_category(
    context: BrowserContext,
    deal_type: str,
    path: str,
    existing_urls: set,
    seen_urls: set,
) -> int:
    new_count = 0
    pending_rows: list[dict] = []

    page = await context.new_page()
    try:
        for page_num in range(1, MAX_PAGES + 1):
            url = f"{BASE_URL}{path}" + (f"?page={page_num}" if page_num > 1 else "")
            html = await get_page_html(page, url)
            if not html:
                log(f"  {deal_type} p{page_num}: empty response - stopping")
                break

            soup = BeautifulSoup(html, "html.parser")

            # Diagnostic on page 1
            if page_num == 1:
                title_el = soup.find("title")
                page_title = title_el.get_text(strip=True) if title_el else "(no title)"
                final_url = page.url
                lower_html = html[:4000].lower()
                bot_flags = [
                    kw for kw in (
                        "cloudflare", "captcha", "enable javascript",
                        "access denied", "403 forbidden", "just a moment",
                        "ddos-guard", "human verification",
                    )
                    if kw in lower_html
                ]
                log(
                    f"  DIAG p1: final_url={final_url!r} "
                    f"body_len={len(html)} "
                    f"title={page_title!r} "
                    f"bot_flags={bot_flags!r}"
                )

            # Collect listing links
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

            # Use a fresh page for detail fetching to avoid stale state
            detail_page = await context.new_page()
            try:
                for listing_url in links:
                    seen_urls.add(listing_url)
                    if listing_url in existing_urls:
                        continue
                    try:
                        detail_html = await get_page_html(detail_page, listing_url, wait_ms=1500)
                        if not detail_html:
                            continue
                        row = parse_detail_page(detail_html, listing_url, deal_type)
                        if row:
                            pending_rows.append(row)
                            existing_urls.add(listing_url)
                            new_count += 1
                            new_on_page += 1
                            log(f"  + {row.get('city')} | {row.get('price')} | {row.get('rooms')}R")
                            # Flush every 10 rows
                            if len(pending_rows) >= 10:
                                await supabase_upsert_rows(pending_rows)
                                pending_rows.clear()
                        await asyncio.sleep(0.3)
                    except Exception as e:
                        log(f"    Detail error {listing_url}: {e}")
            finally:
                await detail_page.close()

            log(f"  {deal_type} p{page_num}: {new_on_page} new inserted")
            if new_on_page == 0 and page_num > 1:
                break
            await asyncio.sleep(1.0)

        # Flush remaining rows
        if pending_rows:
            await supabase_upsert_rows(pending_rows)

    finally:
        await page.close()

    return new_count


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    log("BebKey Janglo Playwright Scraper starting")
    log(f"max_pages={MAX_PAGES}")

    existing_urls = await preload_existing_urls()
    seen_urls: set = set()
    total_new = 0

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=False,   # headful - bypasses many bot checks
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context: BrowserContext = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/137.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
            },
        )

        # Remove webdriver flag that some sites detect
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        # Warm up: visit homepage first to get a session cookie
        warmup_page = await context.new_page()
        try:
            await warmup_page.goto(BASE_URL + "/", wait_until="domcontentloaded", timeout=20_000)
            cookies = await context.cookies()
            log(f"Warmup complete - cookies: {[c['name'] for c in cookies]}")
            await asyncio.sleep(2.0)
        except Exception as e:
            log(f"Warmup failed (continuing): {e}")
        finally:
            await warmup_page.close()

        for deal_type, path in CATEGORIES:
            log(f"Scraping {deal_type}...")
            n = await scrape_category(context, deal_type, path, existing_urls, seen_urls)
            log(f"{deal_type}: {n} new listings")
            total_new += n

        await context.close()
        await browser.close()

    if seen_urls:
        log(f"Refreshing scraped_at for {len(seen_urls)} seen URLs...")
        await refresh_scraped_at(seen_urls)

    log(f"DONE - {total_new} new Janglo listings saved to Supabase")


if __name__ == "__main__":
    asyncio.run(main())
