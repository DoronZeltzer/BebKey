"""
generate_sitemap.py - dynamic sitemap builder for bebkey.com.

Replaces the hand-curated public/sitemap.xml with a multi-file sitemap
generated from Supabase data:

  public/sitemap.xml             - sitemap index pointing to the others
  public/sitemap-static.xml      - fixed pages (Home, Search, legal, etc.)
  public/sitemap-listings.xml    - every active listing
  public/sitemap-landings.xml    - every (deal × city × rooms) combo with
                                   ≥ 1 active listing in the DB
  public/sitemap-cities.xml      - /city/:cityName + /insights/:city
  public/sitemap-blog.xml        - every blog post under public/blog/

Run weekly via .github/workflows/seo_weekly.yml.  Outputs a JSON summary
to stdout that the workflow then uses to drive IndexNow pings.

Required env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).resolve().parent.parent
PUBLIC     = ROOT / "public"
BLOG_DIR   = PUBLIC / "blog"

SITE       = "https://www.bebkey.com"

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", file=sys.stderr)
    sys.exit(1)

# Top 10 Israeli cities by population - anchor the rooms-faceted landings here.
# Other cities still get their `/rent/in/:city` and `/sale/in/:city` pages
# via the looser per-city loop below.
ROOM_FACET_CITIES = [
    "תל אביב", "ירושלים", "חיפה", "ראשון לציון", "פתח תקווה",
    "אשדוד", "נתניה", "באר שבע", "בני ברק", "חולון", "רמת גן",
    "אשקלון", "רחובות", "כפר סבא", "הרצליה", "מודיעין מכבים רעות",
]
ROOM_BUCKETS = ["2", "3", "4", "5"]
DEAL_TYPES   = ["rent", "forsale"]

# ── Resilient fetch ─────────────────────────────────────────────────────────
def _read_retry(req: urllib.request.Request, timeout: int = 90, retries: int = 4):
    """urlopen with retry + exponential backoff. Supabase intermittently returns
    HTTP 500 (statement timeout) on large / ordered queries under load — the same
    request usually succeeds a moment later, so retry transient 5xx and network
    errors before giving up. Returns (status, headers_dict, body_bytes)."""
    last: Exception = RuntimeError("no request attempted")
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code < 500:            # 4xx is a real error — don't retry
                raise
            print(f"  ! {req.get_full_url().split('/rest/')[-1][:70]} -> HTTP {e.code}"
                  f" (attempt {attempt + 1}/{retries})", file=sys.stderr)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            print(f"  ! network error: {e} (attempt {attempt + 1}/{retries})", file=sys.stderr)
        if attempt < retries - 1:
            time.sleep(2 ** attempt)    # 1s, 2s, 4s
    raise last


# ── Helpers ────────────────────────────────────────────────────────────────
def sb(path: str, params: dict | None = None, *, prefer: str | None = None) -> tuple[int, dict, list]:
    """Single Supabase REST GET with count=exact in the Content-Range header."""
    query = "&".join(f"{k}={urllib.parse.quote(str(v), safe='*,.()')}" for k, v in (params or {}).items())
    url = f"{SUPABASE_URL}/rest/v1/{path}" + (f"?{query}" if query else "")
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, headers=headers)
    status, hdrs, raw = _read_retry(req, timeout=30)
    body  = json.loads(raw.decode("utf-8") or "[]")
    crange = hdrs.get("content-range", "*/0")
    total = int(crange.split("/")[-1]) if "/" in crange else len(body)
    return status, hdrs, body if isinstance(body, list) else [body]


def url_entry(loc: str, lastmod: str | None = None, changefreq: str | None = None, priority: float | None = None) -> str:
    parts = [f"  <url><loc>{loc}</loc>"]
    if lastmod: parts.append(f"<lastmod>{lastmod}</lastmod>")
    if changefreq: parts.append(f"<changefreq>{changefreq}</changefreq>")
    if priority is not None: parts.append(f"<priority>{priority:.1f}</priority>")
    parts.append("</url>")
    return "".join(parts)


def write_sitemap(path: Path, entries: list[str]) -> int:
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries) + "\n"
        + "</urlset>\n"
    )
    path.write_text(body, encoding="utf-8")
    return len(entries)


def encode_city(city: str) -> str:
    """URL-encode a Hebrew (or any) city name for use in a path segment."""
    return urllib.parse.quote(city, safe="")


# ── 1. Static sitemap (top-level pages) ────────────────────────────────────
def build_static() -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    entries = [
        url_entry(f"{SITE}/",                lastmod=today, changefreq="daily",   priority=1.0),
        url_entry(f"{SITE}/search",          lastmod=today, changefreq="daily",   priority=0.9),
        # /mortgage-calculator ranks for the massive "מחשבון משכנתא" query cluster
        # and its English cousins.  Priority 0.8 is intentionally high because
        # this is a top-of-funnel keyword that converts to listing views.
        url_entry(f"{SITE}/mortgage-calculator",           changefreq="monthly", priority=0.8),
        # /compare — city-to-city price/inventory comparison, high buyer-intent SEO
        url_entry(f"{SITE}/compare",                       changefreq="weekly",  priority=0.7),
        url_entry(f"{SITE}/pricing",                       changefreq="monthly", priority=0.8),
        url_entry(f"{SITE}/register",                      changefreq="monthly", priority=0.7),
        url_entry(f"{SITE}/login",                         changefreq="monthly", priority=0.6),
        url_entry(f"{SITE}/help",                          changefreq="monthly", priority=0.5),
        url_entry(f"{SITE}/contact",                       changefreq="monthly", priority=0.5),
        url_entry(f"{SITE}/blog",                          changefreq="weekly",  priority=0.7),
        url_entry(f"{SITE}/guides",                        changefreq="weekly",  priority=0.8),
        # NOTE: /insights is a ProtectedRoute — Googlebot gets a redirect to /login
        # when it crawls, so keeping it out of the sitemap avoids "Excluded by
        # redirect" noise in Search Console.  Re-add if it's ever made public.
        url_entry(f"{SITE}/terms",                         changefreq="yearly",  priority=0.3),
        url_entry(f"{SITE}/privacy",                       changefreq="yearly",  priority=0.3),
        url_entry(f"{SITE}/refund",                        changefreq="yearly",  priority=0.3),
        url_entry(f"{SITE}/accessibility",                 changefreq="yearly",  priority=0.2),
    ]
    return write_sitemap(PUBLIC / "sitemap-static.xml", entries)


# ── 2. Listings sitemap (every active listing) ─────────────────────────────
# Priority weighting - when Google's crawl budget is tight (typical for
# new domains with 20k+ URLs), the sitemap's relative priorities matter.
# We give quality signals a boost so the best listings get crawled first:
#   base                          0.4
#   + has at least one image      0.15
#   + has lat/lng (geocoded)      0.10
#   + scraped within last 14 days 0.10
#   + has rooms AND price filled   0.05
#                                  ----
#                          max  ≈ 0.80  (capped at 0.9)
# Entries are written sorted by priority desc so search engines that
# treat sitemap order as a hint will crawl the best listings first.
def _listing_priority(row: dict, today_date) -> float:
    p = 0.4
    imgs = row.get("images")
    has_image = bool(row.get("has_image")) or (isinstance(imgs, list) and len(imgs) > 0)
    if has_image:
        p += 0.15
    if row.get("lat") is not None and row.get("lng") is not None:
        p += 0.10
    sm = (row.get("scraped_at") or "")[:10]
    if sm:
        try:
            from datetime import date
            scraped_d = date.fromisoformat(sm)
            if (today_date - scraped_d).days <= 14:
                p += 0.10
        except (ValueError, TypeError):
            pass
    if row.get("rooms") is not None and row.get("price") is not None:
        p += 0.05
    return min(p, 0.9)


def build_listings() -> int:
    from datetime import date
    today_date = date.today()
    scored: list[tuple[float, str]] = []  # (priority, entry-xml) for sorting

    offset = 0
    page   = 1000
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/listings"
            f"?select=id,scraped_at,has_image,images,lat,lng,rooms,price"
            f"&is_active=eq.true&order=scraped_at.desc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Range":         f"{offset}-{offset + page - 1}",
            "Range-Unit":    "items",
        })
        _, _, raw = _read_retry(req, timeout=90)
        data = json.loads(raw.decode("utf-8") or "[]")
        if not data:
            break
        for row in data:
            lastmod  = (row.get("scraped_at") or "")[:10] or None
            priority = _listing_priority(row, today_date)
            entry    = url_entry(
                f"{SITE}/listing/{row['id']}",
                lastmod=lastmod,
                changefreq="weekly",
                priority=priority,
            )
            scored.append((priority, entry))
        offset += len(data)
        if len(data) < page:
            break
        # Hard cap at 50,000 entries per sitemap (sitemaps.org spec)
        if len(scored) >= 49_000:
            print(f"  ! hit 49,000-entry cap for listings sitemap; truncating",
                  file=sys.stderr)
            break

    # Sort highest-priority first so crawl-budget-limited engines hit the
    # best listings first.  Stable sort within priority preserves the
    # scraped_at-desc tiebreak from the SQL ORDER BY.
    scored.sort(key=lambda t: t[0], reverse=True)
    entries = [e for _, e in scored]
    return write_sitemap(PUBLIC / "sitemap-listings.xml", entries)


# ── 3. Landings sitemap (programmatic SEO pages) ───────────────────────────
def build_landings() -> tuple[int, list[str]]:
    """Generate /rent/in/:city, /sale/in/:city, and the rooms-faceted variants
    for every city that has at least 1 active listing.  Returns the count of
    URLs plus the list (so the IndexNow step can ping fresh ones)."""
    today = datetime.now(timezone.utc).date().isoformat()
    entries: list[str] = []
    urls:    list[str] = []

    # All distinct active cities via the RPC we already have
    url = f"{SUPABASE_URL}/rest/v1/rpc/get_distinct_cities"
    req = urllib.request.Request(url, method="POST", headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }, data=b"{}")
    _, _, raw = _read_retry(req, timeout=30)
    cities = json.loads(raw.decode("utf-8") or "[]")
    if not isinstance(cities, list):
        cities = []
    print(f"  cities with active listings: {len(cities)}", file=sys.stderr)

    for city in cities:
        if not city:
            continue
        city_path = encode_city(city)
        for deal in DEAL_TYPES:
            slug   = "rent" if deal == "rent" else "sale"
            loc    = f"{SITE}/{slug}/in/{city_path}"
            entries.append(url_entry(loc, lastmod=today, changefreq="daily", priority=0.8))
            urls.append(loc)
            # Rooms facet only for major cities - long-tail otherwise has thin content
            if city in ROOM_FACET_CITIES:
                for rooms in ROOM_BUCKETS:
                    loc = f"{SITE}/{slug}/in/{city_path}/{rooms}-rooms"
                    entries.append(url_entry(loc, lastmod=today, changefreq="daily", priority=0.7))
                    urls.append(loc)

    write_sitemap(PUBLIC / "sitemap-landings.xml", entries)
    return len(entries), urls


# ── 4. Cities sitemap (CityLanding + NeighborhoodInsights) ─────────────────
def build_cities() -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    entries: list[str] = []

    url = f"{SUPABASE_URL}/rest/v1/rpc/get_distinct_cities"
    req = urllib.request.Request(url, method="POST", headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }, data=b"{}")
    _, _, raw = _read_retry(req, timeout=30)
    cities = json.loads(raw.decode("utf-8") or "[]")

    for city in cities or []:
        if not city: continue
        slug = encode_city(city)
        entries.append(url_entry(f"{SITE}/city/{slug}",     lastmod=today, changefreq="weekly", priority=0.7))
        entries.append(url_entry(f"{SITE}/insights/{slug}", lastmod=today, changefreq="weekly", priority=0.6))

    return write_sitemap(PUBLIC / "sitemap-cities.xml", entries)


# ── 5. Blog sitemap (every markdown post under public/blog/) ────────────────
def build_blog() -> int:
    entries: list[str] = []
    if not BLOG_DIR.exists():
        BLOG_DIR.mkdir(parents=True, exist_ok=True)
    for md in sorted(BLOG_DIR.glob("*.md")):
        # Skip the .he.md siblings - they're served by content negotiation at
        # the same URL, not a separate URL.
        if md.name.endswith(".he.md"):
            continue
        slug = md.stem
        ts = datetime.fromtimestamp(md.stat().st_mtime, tz=timezone.utc).date().isoformat()
        entries.append(url_entry(f"{SITE}/blog/{slug}", lastmod=ts, changefreq="monthly", priority=0.6))
    return write_sitemap(PUBLIC / "sitemap-blog.xml", entries)


# ── 5b. Guides sitemap (every markdown guide under public/guides/) ──────────
def build_guides() -> int:
    GUIDES_DIR = PUBLIC / "guides"
    entries: list[str] = []
    if not GUIDES_DIR.exists():
        GUIDES_DIR.mkdir(parents=True, exist_ok=True)
    entries.append(url_entry(f"{SITE}/guides", changefreq="weekly", priority=0.8))
    for md in sorted(GUIDES_DIR.glob("*.md")):
        if md.name.endswith(".he.md"):
            continue
        slug = md.stem
        ts = datetime.fromtimestamp(md.stat().st_mtime, tz=timezone.utc).date().isoformat()
        entries.append(url_entry(f"{SITE}/guides/{slug}", lastmod=ts, changefreq="monthly", priority=0.7))
    return write_sitemap(PUBLIC / "sitemap-guides.xml", entries)


# ── 6. Sitemap index - points to all the others ────────────────────────────
def build_index(counts: dict[str, int]) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    items = [
        ("sitemap-static.xml",   counts["static"]),
        ("sitemap-listings.xml", counts["listings"]),
        ("sitemap-landings.xml", counts["landings"]),
        ("sitemap-cities.xml",   counts["cities"]),
        ("sitemap-blog.xml",     counts["blog"]),
        ("sitemap-guides.xml",   counts["guides"]),
    ]
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    )
    for name, n in items:
        if n <= 0:
            continue
        body += (
            f"  <sitemap>\n"
            f"    <loc>{SITE}/{name}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"  </sitemap>\n"
        )
    body += "</sitemapindex>\n"
    (PUBLIC / "sitemap.xml").write_text(body, encoding="utf-8")


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    counts: dict[str, int] = {}
    counts["static"]   = build_static()
    counts["listings"] = build_listings()
    counts["landings"], landing_urls = build_landings()
    counts["cities"]   = build_cities()
    counts["blog"]     = build_blog()
    counts["guides"]   = build_guides()
    build_index(counts)

    total = sum(counts.values())
    summary = {
        "total":    total,
        "counts":   counts,
        "landings": landing_urls[:200],   # first 200 for IndexNow ping budget
    }
    # Print as JSON for the workflow to consume
    print(json.dumps(summary, ensure_ascii=False))
    print(f"  total URLs across sitemaps: {total}", file=sys.stderr)
    print(f"  counts: {counts}", file=sys.stderr)


if __name__ == "__main__":
    main()
