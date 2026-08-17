"""
BebKey - Facebook Groups Scraper

Scrapes Israeli real estate Facebook groups for listings posted by members.

SETUP (one-time, manual):
  1. Create a dedicated Facebook account with a real Israeli SIM
  2. Add profile photo, set location to Israel, wait ~1 week
  3. Manually join target Israeli real estate groups
  4. Log in on Chrome/Firefox, install "Cookie Editor" extension
  5. Export cookies as JSON → store in GitHub Secret FACEBOOK_COOKIES
  6. Set FACEBOOK_GROUP_IDS to comma-separated group IDs

Uses mbasic.facebook.com (basic mobile site) - plain server-rendered HTML.
m.facebook.com renders group posts via JavaScript, so a BeautifulSoup parse
sees 0 posts; mbasic serves the posts directly in the markup.
Runs SLOWLY on purpose: 45-120 second random delay between groups.
Routes through Apify residential proxy (Israeli exit) to protect the account.

Env:
  FACEBOOK_COOKIES       - JSON array of browser cookie objects (required)
  FACEBOOK_GROUP_IDS     - comma-separated FB group IDs (required)
  FB_MAX_POSTS_PER_GROUP - max posts to scan per group per run (default 30)
  WEBSHARE_PROXY_HOST    - residential proxy host:port (e.g. p.webshare.io:80)
  WEBSHARE_PROXY_USER    - proxy username (includes country=IL + sticky session)
  WEBSHARE_PROXY_PASS    - proxy password
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
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
from playwright.async_api import async_playwright
from dotenv import load_dotenv
from quality import enrich
from monitoring import init_sentry

init_sentry("facebook_groups")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "facebook_groups_log.txt")

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

# Config
COOKIES_JSON    = os.getenv("FACEBOOK_COOKIES", "")
GROUP_IDS_RAW   = os.getenv("FACEBOOK_GROUP_IDS", "")
MAX_POSTS       = int(os.getenv("FB_MAX_POSTS_PER_GROUP", "30"))
GROUP_SCROLLS   = int(os.getenv("FB_GROUP_SCROLLS", "12"))
# Human-camouflage delay between groups (seconds). Tunable via env so the
# pacing can be dialed without a code change. The old fixed 15-30 spent ~5 min
# just sleeping across 21 groups; the early-stop + content-wait below claw most
# of the run time back, so this stays as the only deliberate slowdown.
GROUP_DELAY_MIN = float(os.getenv("FB_GROUP_DELAY_MIN", "12"))
GROUP_DELAY_MAX = float(os.getenv("FB_GROUP_DELAY_MAX", "24"))
# Stop scrolling a group after this many consecutive scrolls add no new posts
# (a members-only "join wall" has 0 posts → we bail in ~1 scroll instead of 12).
SCROLL_STALE_LIMIT = int(os.getenv("FB_SCROLL_STALE_LIMIT", "2"))
# Webshare residential proxy (replaced Apify 2026-06-14 — Apify residential
# tier kept timing out, Webshare $3.50/mo for 1 GB IL bandwidth is more
# reliable).  The username carries the country (-il-) and sticky session id
# (-NNNNNN), so no extra params needed.
WS_PROXY_HOST = os.getenv("WEBSHARE_PROXY_HOST", "")
WS_PROXY_USER = os.getenv("WEBSHARE_PROXY_USER", "")
WS_PROXY_PASS = os.getenv("WEBSHARE_PROXY_PASS", "")
PROXY_CFG = (
    {
        "server":   f"http://{WS_PROXY_HOST}",
        "username": WS_PROXY_USER,
        "password": WS_PROXY_PASS,
    }
    if WS_PROXY_HOST and WS_PROXY_USER and WS_PROXY_PASS else None
)

# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Israeli real estate post parser ──────────────────────────────────────────
# These patterns match common Hebrew real estate post formats

DEAL_RENT_RE  = re.compile(r'להשכרה|לשכירות|מחפש\s+לשכור|שכירות', re.I)
DEAL_SALE_RE  = re.compile(r'למכירה|מוכר|מוכרת|מכירה', re.I)
PRICE_RE      = re.compile(
    r'(\d[\d,]+)\s*(?:₪|ש"ח|שח|שקל)|'
    r'(\d+(?:\.\d+)?)\s*מיליון\s*(?:₪|ש"ח|שח)?',
    re.I,
)
ROOMS_RE      = re.compile(r'(\d+(?:[.,]\d)?)\s*(?:חדרים|חד\'|חד\.)', re.I)
SIZE_RE       = re.compile(r'(\d+)\s*(?:מ"ר|מ\'\'ר|מטר(?:\s*רבוע)?)', re.I)
FLOOR_RE      = re.compile(r'קומה\s*(\d+|קרקע)', re.I)
CITY_LIST     = [
    "תל אביב", "ירושלים", "חיפה", "ראשון לציון", "פתח תקוה", "באר שבע",
    "נתניה", "חולון", "בני ברק", "רמת גן", "אשדוד", "אשקלון", "רחובות",
    "הרצליה", "כפר סבא", "רעננה", "בת ים", "הוד השרון", "מודיעין",
    "בית שמש", "רמת השרון", "נס ציונה", "לוד", "רמלה", "עכו", "נהריה",
    "קריית אתא", "חדרה", "זכרון יעקב", "קיסריה", "גבעתיים", "קריית אונו",
    "יהוד", "אור יהודה", "טבריה", "צפת", "נצרת", "עפולה", "קריית שמונה",
    "אילת", "ערד", "דימונה", "קריית גת", "אשקלון", "שדרות", "נתיבות",
]
CITY_RE = re.compile(r'ב(' + '|'.join(re.escape(c) for c in CITY_LIST) + r')', re.I)
STREET_RE = re.compile(r'(?:רחוב|ברחוב|ב?רח\')\s+([א-ת\s\'\-]{3,25}?)(?:\s+\d+)?(?:[,\s]|$)', re.I)


def _parse_price(text: str) -> int | None:
    for m in PRICE_RE.finditer(text):
        if m.group(2):  # millions format
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


def parse_post(post_text: str, post_url: str, images: list[str],
               infer_deal: bool = False) -> dict | None:
    """Parse a Facebook group post and extract real estate listing data.

    infer_deal=True (group feeds): if the post has no explicit rent/sale word,
    infer the deal type from price magnitude rather than rejecting it - these
    are real-estate groups, so a bare "3 rooms, 6000" is still a listing."""
    if not post_text or len(post_text) < 20:
        return None

    # Determine deal type
    has_rent = bool(DEAL_RENT_RE.search(post_text))
    has_sale = bool(DEAL_SALE_RE.search(post_text))
    if has_rent:
        deal_type = "rent"
    elif has_sale:
        deal_type = "forsale"
    elif not infer_deal:
        return None  # Not a real estate listing
    else:
        deal_type = None  # resolve from price after parsing (below)

    # Price
    price = _parse_price(post_text)

    # Rooms
    rooms = None
    m = ROOMS_RE.search(post_text)
    if m:
        try:
            rooms = float(m.group(1).replace(",", "."))
            if rooms < 1 or rooms > 20:
                rooms = None
        except ValueError:
            pass

    # Size
    size_m2 = None
    m = SIZE_RE.search(post_text)
    if m:
        try:
            size_m2 = float(m.group(1))
        except ValueError:
            pass

    # Floor
    floor = None
    m = FLOOR_RE.search(post_text)
    if m:
        fraw = m.group(1)
        floor = 0 if "קרקע" in fraw else (int(fraw) if fraw.isdigit() else None)

    # City
    city = None
    m = CITY_RE.search(post_text)
    if m:
        city = m.group(1).strip()

    # Street
    street = None
    m = STREET_RE.search(post_text)
    if m:
        candidate = m.group(1).strip()
        if 2 < len(candidate) < 40:
            street = candidate

    # Must have at least price or rooms to be worth saving
    if not price and rooms is None:
        return None

    # Inferred deal type (group post with no rent/sale keyword): Israeli rent is
    # a few thousand ₪/mo, sale is hundreds of thousands+ → split at ₪30k.
    if deal_type is None:
        deal_type = "rent" if (price and price < 30_000) else "forsale"

    # Description: first 800 chars of post
    desc = post_text[:800].strip() or None

    return {
        "source":      "facebook_groups",
        "source_id":   post_url.split("/")[-2] if "/" in post_url else post_url[-20:],
        "source_url":  post_url,
        "deal_type":   deal_type,
        "price":       price,
        "city":        city,
        "street":      street,
        "rooms":       rooms,
        "size_m2":     size_m2,
        "floor":       floor,
        "description": desc,
        "images":      images[:10],
        "is_active":   True,
        "scraped_at":  datetime.now(timezone.utc).isoformat(),
    }


# ── Supabase ──────────────────────────────────────────────────────────────────
async def preload_existing_urls(client: httpx.AsyncClient) -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    while True:
        try:
            r = await client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={"select": "source_url", "source": "eq.facebook_groups",
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
    log(f"Preloaded {len(existing)} existing Facebook Groups URLs")
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
        log(f"  ⚠ Supabase {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log(f"  ⚠ Supabase error: {e}")
    return 0


# ── Session validation ────────────────────────────────────────────────────────
async def validate_session(page) -> bool:
    """Check the FB cookie session is still logged in (full www site)."""
    try:
        await page.goto("https://www.facebook.com/me", timeout=45_000,
                        wait_until="domcontentloaded")
        await asyncio.sleep(2)
        url = page.url.lower()
        if "login" in url or "checkpoint" in url:
            log("⚠ Facebook session invalid - redirected to login/checkpoint")
            return False
        log("✓ Facebook session valid")
        return True
    except Exception as e:
        log(f"Session check error: {e}")
        return False


# ── mbasic post extraction helpers ────────────────────────────────────────────
MBASIC_BASE = "https://mbasic.facebook.com"
WWW_BASE    = "https://www.facebook.com"

# Permalink anchor patterns that identify an mbasic group post.  mbasic links
# come in a few shapes:
#   /groups/{id}/permalink/{fbid}/       (standard group post)
#   /story.php?story_fbid=...&id=...      (story permalink)
#   /photo.php?fbid=...                   (photo post)
PERMALINK_SELECTOR = (
    'a[href*="/permalink/"], '
    'a[href*="story.php?story_fbid="], '
    'a[href*="story_fbid="], '
    'a[href*="/photo.php"], '
    'a[href*="/posts/"]'
)


def _abs_url(href: str) -> str:
    """Build an absolute URL from an mbasic/relative href, stripping tracking."""
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    elif href.startswith("/"):
        href = MBASIC_BASE + href
    # Keep the query for story.php/photo.php (the ids live there); drop it for
    # /permalink/ and /posts/ paths where the path already identifies the post.
    if "story.php" in href or "photo.php" in href:
        # Trim FB tracking params but keep the identifying ones.
        base, _, query = href.partition("?")
        keep = []
        for part in query.split("&"):
            if part.startswith(("story_fbid=", "fbid=", "id=")):
                keep.append(part)
        href = base + ("?" + "&".join(keep) if keep else "")
    else:
        href = href.split("?")[0]
    return href


def _find_permalink(container) -> str:
    """Return the first absolute post permalink URL inside a container."""
    for a in container.select(PERMALINK_SELECTOR):
        href = a.get("href", "")
        if not href:
            continue
        # Skip pure profile/comment/like links that sometimes also match.
        if "/permalink/" in href or "story_fbid=" in href or "/posts/" in href:
            return _abs_url(href)
        if "/photo.php" in href and "fbid=" in href:
            return _abs_url(href)
    return ""


def _block_ancestor(node):
    """Walk up from an anchor to its nearest block-level <div>/<article> post."""
    cur = node
    for _ in range(8):
        parent = cur.parent
        if parent is None or getattr(parent, "name", None) is None:
            return cur
        if parent.name in ("article", "body", "html"):
            return parent if parent.name == "article" else cur
        if parent.name == "div" and (parent.get("id") or parent.get("data-ft")):
            return parent
        cur = parent
    return cur


def _extract_mbasic_posts(soup, max_posts: int) -> list[tuple]:
    """Extract (text, permalink, images) tuples from an mbasic group page."""
    # Candidate containers, in priority order:
    #   1. children of the group stories container
    #   2. divs carrying a data-ft payload (mbasic tags posts with it)
    #   3. articles (rare on mbasic but cheap to try)
    candidates = (
        soup.select("#m_group_stories_container > div") or
        soup.select('div[role="article"]') or
        soup.select("article") or
        soup.select("div[data-ft]")
    )
    # Fallback: walk up from each permalink anchor to its nearest block ancestor.
    if not candidates:
        seen = []
        for a in soup.select(PERMALINK_SELECTOR):
            blk = _block_ancestor(a)
            if blk is not None and blk not in seen:
                seen.append(blk)
        candidates = seen

    posts = []
    seen_urls = set()
    for container in candidates:
        post_url = _find_permalink(container)
        if not post_url or post_url in seen_urls:
            continue
        seen_urls.add(post_url)

        # Post text: mbasic renders it inline. Pull paragraph/div/span text and
        # drop the boilerplate "See more"/"הצג עוד" affordance.
        text_parts = []
        for el in container.select("p, span, div"):
            # Avoid double-counting nested wrappers: only take leaf-ish text.
            if el.find(["p", "div"]):
                continue
            t = el.get_text(separator=" ", strip=True)
            if t and len(t) > 5 and t not in ("See more", "See More",
                                              "הצג עוד", "ראה עוד"):
                text_parts.append(t)
        if not text_parts:
            t = container.get_text(separator=" ", strip=True)
            if t:
                text_parts.append(t)
        post_text = " ".join(dict.fromkeys(text_parts))[:2000]

        # Images: mbasic thumbnails / scontent CDN URLs.
        images = []
        for img in container.select("img"):
            src = img.get("src") or img.get("data-src") or ""
            if not src:
                continue
            if src.startswith("//"):
                src = "https:" + src
            if "scontent" in src or "fbcdn" in src:
                images.append(src)
        # Dedupe while preserving order.
        images = list(dict.fromkeys(images))[:5]

        posts.append((post_text, post_url, images))
        if len(posts) >= max_posts:
            break
    return posts


def _next_page_url(soup) -> str:
    """Find the mbasic 'See more posts'/pagination link, if any."""
    for a in soup.select("a[href]"):
        txt = a.get_text(strip=True)
        href = a.get("href", "")
        if not href:
            continue
        if ("See more posts" in txt or "See More Posts" in txt
                or "הצג פוסטים נוספים" in txt or "פוסטים נוספים" in txt
                or "Show more" in txt):
            return _abs_url(href) if href.startswith(("/", "//")) else href
    # mbasic often labels the feed cursor link inside the stories container.
    cont = soup.select_one("#m_group_stories_container")
    if cont is not None:
        for a in cont.select('a[href*="/groups/"]'):
            href = a.get("href", "")
            if "bacr" in href or "multi_permalinks" in href or "refid" in href:
                return _abs_url(href) if href.startswith(("/", "//")) else href
    return ""


# ── Scrape one group ──────────────────────────────────────────────────────────
async def scrape_group(
    page,
    http_client: httpx.AsyncClient,
    existing_urls: set[str],
    group_id: str,
    max_posts: int,
) -> int:
    """Scrape posts from one Facebook group. Returns count of new listings saved."""
    # mbasic no longer serves the post feed (FB gutted it — confirmed: page
    # loads with the group title but permalinks=0/data_ft=0). Use the full www
    # group feed, scroll to lazy-load, and extract posts from the rendered DOM.
    url = f"https://www.facebook.com/groups/{group_id}"
    log(f"  → Group {group_id}: {url}")
    try:
        await page.goto(url, timeout=35_000, wait_until="domcontentloaded")
    except Exception as e:
        log(f"  Group load error {group_id}: {e}")
        return 0
    cur = page.url.lower()
    if "login" in cur or "checkpoint" in cur:
        # A single group redirecting is NOT proof the session died
        # (validate_session already passed via /me). It usually means FB
        # challenged this navigation (datacenter IP / headless, no working
        # proxy) or the group is members-only. Skip this group, keep going.
        log(f"  Group {group_id}: redirected to login/checkpoint - skipping "
            f"(FB challenge or not a member)")
        return 0
    # Wait for the feed to render rather than blindly sleeping the full window:
    # proceed the instant a post permalink or article appears (cap ~7s).
    try:
        await page.wait_for_selector(
            'a[href*="/posts/"], a[href*="/permalink/"], div[role="article"]',
            timeout=7_000,
        )
    except Exception:
        await asyncio.sleep(random.uniform(1.5, 3))  # nothing yet — brief settle
    try:
        log(f"  Group {group_id}: \"{await page.title()}\"")
    except Exception:
        pass

    # Each post is a div[role=article]; pull its text, a post/permalink link,
    # and any content images (skip tiny avatar/emoji imgs).
    extract_js = r"""
    () => {
      const out = [];
      const seen = new Set();
      // Anchor on POST permalinks: a story's timestamp links to
      // /groups/<gid>/posts/<id> or /permalink/<id>. Comment links carry
      // ?comment_id= → skip them, so we capture posts, not comments
      // (role=article matches both, which is why the earlier pass got comments).
      document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]').forEach(l => {
        const h = l.getAttribute('href') || '';
        if (h.includes('comment_id') || h.includes('/comment')) return;
        const m = h.match(/\/(?:posts|permalink)\/(\d+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        const art = l.closest('div[role="article"]') || l.parentElement;
        if (!art) return;
        const text = (art.innerText || '').trim();
        if (text.length < 30) return;
        seen.add(id);
        const imgs = [];
        art.querySelectorAll('img').forEach(im => {
          const s = im.src || '';
          if (s.startsWith('http') && (im.naturalWidth > 130 || im.width > 130))
            imgs.push(s);
        });
        out.push({ text, url: h.split('?')[0], imgs: imgs.slice(0, 10) });
      });
      return out;
    }
    """
    collected: dict = {}
    stale = 0
    try:
        for _ in range(GROUP_SCROLLS):
            items = await page.evaluate(extract_js)
            before = len(collected)
            for it in items:
                key = it.get("url") or it["text"][:80]
                collected.setdefault(key, it)
            if len(collected) >= max_posts:
                break
            # Early-stop: if consecutive scrolls stop surfacing new posts the
            # feed is exhausted (or it's a members-only join wall with none at
            # all) — quit instead of burning the full GROUP_SCROLLS × ~3s.
            if len(collected) == before:
                stale += 1
                if stale >= SCROLL_STALE_LIMIT:
                    break
            else:
                stale = 0
            await page.mouse.wheel(0, 5000)
            await asyncio.sleep(random.uniform(1.5, 3))
    except Exception as e:
        log(f"  Post extraction error {group_id}: {e}")

    items = list(collected.values())[:max_posts]
    if not items:
        # Distinguish "not a member / pending approval" (join wall, no feed)
        # from "member but extraction failed" (feed present, no post links).
        try:
            diag = await page.evaluate(r"""() => {
              const t = (document.body ? document.body.innerText : '').slice(0, 6000);
              return {
                articles:   document.querySelectorAll('div[role="article"]').length,
                postLinks:  document.querySelectorAll('a[href*="/posts/"]').length,
                permaLinks: document.querySelectorAll('a[href*="/permalink/"]').length,
                joinWall:   /join group|join this group|בקשה להצטרף|הצטרפות לקבוצה/i.test(t),
                pending:    /request sent|pending|requested to join|בקשתך נשלחה|ממתין לאישור/i.test(t),
              };
            }""")
            log(f"  Group {group_id}: 0 posts  [diag {json.dumps(diag, ensure_ascii=False)}]")
        except Exception:
            log(f"  Group {group_id}: 0 posts found")
    else:
        log(f"  Group {group_id}: {len(items)} posts found")

    new_rows = []
    for it in items:
        u = it.get("url")
        if u and u.startswith("http"):
            post_url = u
        elif u:
            post_url = WWW_BASE + u
        else:
            post_url = (f"https://www.facebook.com/groups/{group_id}/"
                        f"?p={abs(hash(it['text'])) % 10**10}")
        if post_url in existing_urls:
            continue
        row = parse_post(it["text"], post_url, it.get("imgs") or [], infer_deal=True)
        if not row:
            continue
        existing_urls.add(post_url)
        new_rows.append(row)

    if new_rows:
        saved = await upsert_batch(http_client, new_rows)
        log(f"  ✓ Group {group_id}: {saved} new listings saved")
        return saved
    if items:
        # Found posts but none parsed → dump a sample so we can see what the
        # extracted text actually looks like and fix the parser/selectors.
        sample = items[0]["text"].replace("\n", " ")[:220]
        log(f"  · Group {group_id}: {len(items)} posts but 0 parsed — sample: {sample!r}")
    else:
        log(f"  · Group {group_id}: 0 new listings")
    return 0


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Facebook Groups Scraper starting")

    # Validate config
    if not COOKIES_JSON:
        log("FACEBOOK_COOKIES not set - skipping (set up account first)")
        log("See scraper docstring for setup instructions")
        return

    if not GROUP_IDS_RAW:
        log("FACEBOOK_GROUP_IDS not set - nothing to scrape")
        return

    group_ids = [g.strip() for g in GROUP_IDS_RAW.split(",") if g.strip()]
    log(f"Groups: {len(group_ids)} | max_posts={MAX_POSTS} | proxy={'yes' if PROXY_CFG else 'no'}")
    log("=" * 60)

    # Parse cookies
    try:
        cookies = json.loads(COOKIES_JSON)
        if not isinstance(cookies, list):
            log("ERROR: FACEBOOK_COOKIES must be a JSON array"); return
        log(f"Loaded {len(cookies)} cookies")
    except json.JSONDecodeError as e:
        log(f"ERROR: FACEBOOK_COOKIES is not valid JSON: {e}"); return

    async with httpx.AsyncClient(timeout=30) as http_client:
        existing = await preload_existing_urls(http_client)

        # Build cookies once for reuse across proxy/direct attempts.
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
                # Desktop UA: the www group feed renders div[role=article] posts;
                # mbasic no longer serves them.
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

            log(f"Injected {len(pw_cookies)} cookies into browser context")
            browser, page, ok = await open_session(with_proxy=bool(PROXY_CFG))
            # Proxy can be down (502s) even with valid cookies → fall back direct.
            if not ok and PROXY_CFG:
                log("Proxy session failed — retrying WITHOUT proxy (proxy may be down)")
                await browser.close()
                browser, page, ok = await open_session(with_proxy=False)
            if not ok:
                log("Session invalid (even direct) - aborting. Refresh FACEBOOK_COOKIES secret.")
                await browser.close()
                return

            # Scrape each group slowly - one at a time, large random delay
            total_new = 0
            for i, group_id in enumerate(group_ids):
                result = await scrape_group(
                    page, http_client, existing, group_id, MAX_POSTS
                )
                if result == -1:
                    log("Session expired mid-run - stopping")
                    break
                total_new += max(0, result)

                # Slow down - look human (env-tunable, default 12-24s). The
                # early-stop scroll + content-wait above already cut the per-group
                # work sharply, so this pacing is now the main time budget.
                if i < len(group_ids) - 1:
                    delay = random.uniform(GROUP_DELAY_MIN, GROUP_DELAY_MAX)
                    log(f"  Sleeping {delay:.0f}s before next group...")
                    await asyncio.sleep(delay)

            await page.close()
            await browser.close()

    log("=" * 60)
    log(f"DONE - {total_new} new Facebook Groups listings saved")
    log("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
