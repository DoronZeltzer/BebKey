"""
BebKey - Yad2 Direct API Scraper (no browser, no Apify, runs free on GitHub Actions)

Hits Yad2's internal map JSON API which surprisingly returns up to 200 markers
per request with no PerimeterX challenge - even from GitHub Actions IPs.

Endpoint:
  GET https://gw.yad2.co.il/realestate-feed/{forsale|rent}/map
       ?region=<1..8>&city=<id>

Output per marker is rich: price, address (region/city/area/neighborhood/street/house),
roomsCount, squareMeter, propertyCondition, images, coords, token, adType.

Iteration plan:
  for each (deal_type, city) in (forsale,rent) × ALL_CITIES:
      request the map endpoint with region + city filter
      parse each marker → upsert into Supabase

No browser, no proxy, no Apify.  Runs in ~3-5 minutes for ~200 cities.

Env:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  YAD2_API_CONCURRENCY  (default 6)
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv
from quality import enrich
from monitoring import init_sentry, ping_dead_man
from scraper_utils import get_with_retry, default_browser_headers

init_sentry("yad2_api")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "yad2_api_scraper_log.txt")

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

# Yad2 region mapping discovered via probe (May 2026)
#   1 = מרכז והשרון       Center & Sharon
#   2 = דרום              South
#   3 = תל אביב והסביבה   Tel Aviv area
#   4 = יהודה, שומרון      West Bank / Jordan Valley
#   5 = מישור החוף הצפוני Northern coast (Haifa area)
#   6 = ירושלים           Jerusalem
#   7 = צפון ועמקים        North & valleys
#   8 = ירושלים           Jerusalem (alt)
ALL_REGIONS = [1, 2, 3, 4, 5, 6, 7, 8]

DEAL_TYPES = [("forsale", "forsale"), ("rent", "rent")]

CONCURRENCY = int(os.getenv("YAD2_API_CONCURRENCY", "6"))

# Browser-y headers for the gw.yad2.co.il JSON API.
# json_response=True flips Accept + Sec-Fetch-* to the values a real browser
# sends for XHR/fetch calls (vs document navigation).
HEADERS = default_browser_headers(
    referer="https://www.yad2.co.il/realestate/forsale",
    origin="https://www.yad2.co.il",
    accept_language="he-IL,he;q=0.9,en;q=0.8",
    json_response=True,
)

# Cities - reuse the canonical list we built for the rest of the project
try:
    from israel_cities import yad2_tuples
    CITIES = yad2_tuples()
except ImportError:
    # Fallback: minimal hard-coded list of major cities (yad2 city IDs)
    CITIES = [
        ("תל אביב יפו", 5000, 1, 3),
        ("ירושלים", 3000, 6, 2),
        ("חיפה", 4000, 8, 1),
        ("ראשון לציון", 8300, 2, 3),
        ("באר שבע", 1024, 7, 5),
        ("פתח תקוה", 7900, 2, 3),
        ("חולון", 2400, 2, 3),
        ("בני ברק", 1014, 2, 3),
        ("רמת גן", 8600, 2, 3),
    ]


# ── Logging ───────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Supabase ──────────────────────────────────────────────────────────────────
# IMPORTANT: Supabase blocks service-role keys when the request looks browser-y
# (Mozilla UA, Origin, Sec-Fetch-* headers).  Our site client carries all of
# those because the gw.yad2.co.il API is fingerprint-checked.  So every
# Supabase REST call MUST go through a fresh httpx.AsyncClient with a
# Python-default UA.  The `client` param is kept for backward-compat but unused.
async def preload_existing_urls(client: httpx.AsyncClient) -> set[str]:
    existing: set[str] = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{REST_URL}/listings",
                    headers={**SB_HEADERS, "Prefer": ""},
                    params={
                        "select":   "source_url",
                        "source":   "eq.yad2",
                        "is_active": "eq.true",
                        "limit":    limit,
                        "offset":   offset,
                    },
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
        async with httpx.AsyncClient(timeout=30) as sb:
            r = await sb.post(
                # on_conflict=source_url merges on the listings_source_url_unique
                # constraint instead of the PK; without it ON CONFLICT can't fire
                # and a single duplicate URL drops the whole batch.
                f"{REST_URL}/listings?on_conflict=source_url",
                headers=SB_HEADERS,
                content=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
            )
        if r.status_code in (200, 201):
            return len(rows)
        log(f"  ⚠ Supabase upsert {r.status_code}: {r.text[:200]}")
        return 0
    except Exception as e:
        log(f"  ⚠ upsert error: {e}")
        return 0


# ── Marker → row ──────────────────────────────────────────────────────────────
def _bool_flag(val):
    if val is None: return None
    if isinstance(val, bool): return val
    if isinstance(val, (int, float)): return val > 0
    if isinstance(val, str): return val.lower() not in ("false", "0", "no", "")
    return None


def parse_marker(marker: dict, deal_type: str) -> dict | None:
    token = (marker.get("token") or marker.get("id")
             or marker.get("orderId") or marker.get("order_id"))
    if not token:
        return None

    addr     = marker.get("address") or {}
    city_t   = (addr.get("city") or {}).get("text") or ""
    street_t = (addr.get("street") or {}).get("text") or ""
    house_n  = str((addr.get("house") or {}).get("number") or "")
    floor    = (addr.get("house") or {}).get("floor")
    try:
        floor = int(floor) if floor is not None else None
    except (TypeError, ValueError):
        floor = None
    street   = f"{street_t} {house_n}".strip() or None
    neighborhood = (addr.get("neighborhood") or {}).get("text") or None

    coords = (addr.get("coords") or {}) if isinstance(addr.get("coords"), dict) else {}
    try:
        lat = float(coords.get("lat")) if coords.get("lat") is not None else None
        lon_val = coords.get("lon") if coords.get("lon") is not None else coords.get("lng")
        lng = float(lon_val) if lon_val is not None else None
    except (TypeError, ValueError):
        lat = lng = None

    add = marker.get("additionalDetails") or {}
    rooms = add.get("roomsCount")
    try:
        rooms = float(rooms) if rooms is not None else None
        if rooms and (rooms < 1 or rooms > 20):
            rooms = None
    except (TypeError, ValueError):
        rooms = None

    size_m2 = add.get("squareMeter") or (marker.get("metaData") or {}).get("squareMeterBuild")
    try:
        size_m2 = float(size_m2) if size_m2 is not None else None
    except (TypeError, ValueError):
        size_m2 = None

    prop_type = (add.get("property") or {}).get("text") if isinstance(add.get("property"), dict) else None

    price = marker.get("price")
    try:
        price = int(price) if price else None
    except (TypeError, ValueError):
        price = None
    if price and price > 50_000_000:
        return None

    meta   = marker.get("metaData") or {}
    cover  = meta.get("coverImage") or ""
    images = []
    for img in ([cover] + (meta.get("images") or [])):
        if img and img not in images:
            images.append(img)
    images = images[:10]

    source_url = f"https://www.yad2.co.il/item/{token}"

    return {
        "source":          "yad2",
        "source_id":       token,
        "source_url":      source_url,
        "deal_type":       deal_type,
        "price":           price,
        "city":            city_t,
        "neighborhood":    neighborhood,
        "street":          street,
        "size_m2":         size_m2,
        "rooms":           rooms,
        "floor":           floor,
        "property_type":   prop_type,
        "images":          images,
        "is_active":       True,
        "lat":             lat,
        "lng":             lng,
        "parking":         _bool_flag(add.get("parking")),
        "elevator":        _bool_flag(add.get("elevator")),
        "balcony":         _bool_flag(add.get("balcony")),
        "mamad":           _bool_flag(add.get("shelter") or add.get("safeRoom")),
        "furnished":       _bool_flag(add.get("furniture") or add.get("furnished")),
        "air_conditioning":_bool_flag(add.get("air_conditioner")),
        "scraped_at":      datetime.now(timezone.utc).isoformat(),
    }


def parse_yad1_marker(marker: dict) -> dict | None:
    """Parse a Yad2 'yad1' NEW-CONSTRUCTION PROJECT marker.

    These come back in the SAME map response as regular markers (under
    data.yad1Markers) but were previously discarded - net-new for-sale
    inventory (new-build projects) with rich name/description/images.
    One row per project."""
    token = (marker.get("token") or marker.get("listingId")
             or marker.get("orderId") or marker.get("projectId"))
    if not token:
        return None
    project_id = marker.get("projectId") or token

    addr     = marker.get("address") or {}
    city_t   = (addr.get("city") or {}).get("text") or ""
    if not city_t:
        return None
    street_t = (addr.get("street") or {}).get("text") or ""
    house_n  = str((addr.get("house") or {}).get("number") or "")
    street   = f"{street_t} {house_n}".strip() or None
    neighborhood = (addr.get("neighborhood") or {}).get("text") or None

    coords = addr.get("coords") if isinstance(addr.get("coords"), dict) else {}
    try:
        lat = float(coords.get("lat")) if coords.get("lat") is not None else None
        lon_val = coords.get("lon") if coords.get("lon") is not None else coords.get("lng")
        lng = float(lon_val) if lon_val is not None else None
    except (TypeError, ValueError):
        lat = lng = None

    add = marker.get("additionalDetails") or {}
    rooms = add.get("roomsCount")
    try:
        rooms = float(rooms) if rooms is not None else None
        if rooms and (rooms < 1 or rooms > 20):
            rooms = None
    except (TypeError, ValueError):
        rooms = None
    floor = add.get("minFloor")
    try:
        floor = int(floor) if floor is not None else None
    except (TypeError, ValueError):
        floor = None

    price = marker.get("price")
    try:
        price = int(price) if price else None
    except (TypeError, ValueError):
        price = None
    if price and price > 50_000_000:
        price = None

    meta  = marker.get("metaData") or {}
    name  = meta.get("projectName") or ""
    promo = meta.get("promotionText") or ""
    info  = meta.get("info") or ""
    desc  = " · ".join(p for p in (name, promo) if p)
    if info:
        desc = (desc + "\n" + info) if desc else info
    desc = (desc.strip()[:2000] or None)

    images: list[str] = []
    for img in (meta.get("images") or []):
        if img and img not in images:
            images.append(img)
    images = images[:10]

    # New-construction projects have no stable public per-item URL in the gw
    # API; link to the Yad2 for-sale section keyed by project id - always
    # resolves (200) and is unique per project so it dedupes cleanly.
    source_url = f"https://www.yad2.co.il/realestate/forsale?projectId={project_id}"

    return {
        "source":        "yad2",
        "source_id":     f"yad1-{token}",
        "source_url":    source_url,
        "deal_type":     "forsale",
        "price":         price,
        "city":          city_t,
        "neighborhood":  neighborhood,
        "street":        street,
        "size_m2":       None,
        "rooms":         rooms,
        "floor":         floor,
        "property_type": "פרויקט חדש",
        "description":   desc,
        "images":        images,
        "is_active":     True,
        "lat":           lat,
        "lng":           lng,
        "scraped_at":    datetime.now(timezone.utc).isoformat(),
    }


# ── Per-city fetch with price-bracket subdivision ────────────────────────────
# The Yad2 map endpoint caps responses at 200 markers per request.  Dense
# cities like Tel Aviv (1500+ forsale listings) overflow this cap, so we
# subdivide by price bracket when we detect a full 200-marker response.
# Probe in May 2026 confirmed `minPrice`/`maxPrice` params work; older
# names like `priceFrom`/`priceTo` are rejected.
# Finer brackets - Tel Aviv test (May 2026) showed several wider brackets
# still hit the 200-marker cap, missing ~30% of listings.  These slice
# narrower so even Tel Aviv's most popular price bands fit under 200.
PRICE_BRACKETS_FORSALE: list[tuple[int | None, int | None]] = [
    (None,        1_000_000),
    (1_000_000,   1_500_000),
    (1_500_000,   2_000_000),
    (2_000_000,   2_500_000),
    (2_500_000,   3_000_000),
    (3_000_000,   3_500_000),
    (3_500_000,   4_500_000),
    (4_500_000,   6_000_000),
    (6_000_000,   9_000_000),
    (9_000_000,   None),
]
PRICE_BRACKETS_RENT: list[tuple[int | None, int | None]] = [
    (None,        2_500),
    (2_500,       3_500),
    (3_500,       4_500),
    (4_500,       5_500),
    (5_500,       6_500),
    (6_500,       8_000),
    (8_000,       10_000),
    (10_000,      13_000),
    (13_000,      18_000),
    (18_000,      None),
]

CAP_THRESHOLD = 200  # Yad2's hard limit per response

async def _fetch_once(client: httpx.AsyncClient, deal_url: str,
                       city_id: int, region_id: int,
                       min_price: int | None = None,
                       max_price: int | None = None) -> tuple[list[dict], list[dict]] | None:
    """One Yad2 map request.  Returns (markers, yad1Markers), or None on error.
    `markers` are regular listings; `yad1Markers` are new-construction projects
    (same response, previously discarded).  Pass city_id=0 to query the whole
    region (no city filter) - catches listings in moshavim/kibbutzim/settlements
    that aren't bound to a Yad2-indexed city."""
    url    = f"https://gw.yad2.co.il/realestate-feed/{deal_url}/map"
    params: dict = {"region": str(region_id)}
    if city_id:
        params["city"] = str(city_id)
    if min_price is not None: params["minPrice"] = str(min_price)
    if max_price is not None: params["maxPrice"] = str(max_price)
    try:
        r = await get_with_retry(client, url, log, params=params, timeout=20)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    try:
        data = (r.json().get("data") or {})
        return (data.get("markers") or [], data.get("yad1Markers") or [])
    except Exception:
        return None

RECURSION_MAX_DEPTH = 4   # 4 halvings = 16x finer than the base bracket
# Effective upper bound when splitting an open-ended (hi=None) top bracket.
# Yad2 doesn't list anything above 50M ₪ for sale or 100k ₪/mo rent in
# practice, so this is a generous ceiling for the bisection math.
_OPEN_UPPER_FORSALE = 50_000_000
_OPEN_UPPER_RENT    = 100_000

async def _fetch_bracket_recursive(
    client: httpx.AsyncClient, deal_url: str, deal_type: str,
    city_name: str, city_id: int, region_id: int,
    lo: int | None, hi: int | None, depth: int,
) -> list[dict]:
    """Fetch a single price bracket; if it hits the 200 cap and we still
    have recursion budget, halve and recurse.  (Regular markers only - yad1
    project markers are captured once from the bare call in fetch_city.)"""
    res = await _fetch_once(client, deal_url, city_id, region_id, lo, hi)
    if res is None:
        return []
    sub = res[0]
    if len(sub) < CAP_THRESHOLD or depth >= RECURSION_MAX_DEPTH:
        if len(sub) >= CAP_THRESHOLD:
            log(f"    {'  '*depth}· {deal_type}/{city_name} {lo}-{hi} d{depth}: "
                f"STILL capped at 200 (depth limit hit)")
        return sub

    # Halve the bracket and recurse.  For open-ended top bracket, use the
    # effective ceiling so we have a finite midpoint.
    effective_hi = hi if hi is not None else (
        _OPEN_UPPER_FORSALE if deal_type == "forsale" else _OPEN_UPPER_RENT
    )
    effective_lo = lo if lo is not None else 0
    mid = (effective_lo + effective_hi) // 2
    if mid <= effective_lo or mid >= effective_hi:
        return sub  # can't subdivide further (integers collided)

    log(f"    {'  '*depth}↪ {deal_type}/{city_name} {lo}-{hi} d{depth}: "
        f"200 cap, splitting at {mid}")
    left  = await _fetch_bracket_recursive(client, deal_url, deal_type,
                                            city_name, city_id, region_id,
                                            lo, mid, depth + 1)
    right = await _fetch_bracket_recursive(client, deal_url, deal_type,
                                            city_name, city_id, region_id,
                                            mid, hi, depth + 1)
    return left + right


async def fetch_city(client: httpx.AsyncClient, deal_url: str, deal_type: str,
                      city_name: str, city_id: int, region_id: int
                      ) -> tuple[list[dict], list[dict]]:
    """Adaptive fetch - bare query first; if it hits the 200-marker cap,
    fall back to price-bracket subdivision (recursive when needed).
    Returns (regular_markers, yad1_project_markers).
    Pass city_id=0 to sweep the whole region (no city filter)."""
    if not region_id:
        return [], []

    # Try bare city first (fast path for low-density cities).  The bare call
    # also carries the new-construction project markers (yad1Markers), which
    # are always < 200 so a single bare call captures them all.
    res = await _fetch_once(client, deal_url, city_id, region_id)
    if res is None:
        log(f"  ✗ {deal_type}/{city_name}: fetch failed")
        return [], []
    markers, yad1 = res
    if len(markers) < CAP_THRESHOLD:
        return markers, yad1

    # Overflow - subdivide by price brackets (recursing on any bracket
    # that also overflows) and dedupe by listing token.
    log(f"  ⚠ {deal_type}/{city_name}: 200-cap hit, subdividing by price")
    brackets = PRICE_BRACKETS_FORSALE if deal_type == "forsale" else PRICE_BRACKETS_RENT

    merged: list[dict] = []
    seen_tokens: set[str] = set()
    for lo, hi in brackets:
        sub = await _fetch_bracket_recursive(
            client, deal_url, deal_type, city_name, city_id, region_id,
            lo, hi, depth=0,
        )
        added = 0
        for m in sub:
            tok = m.get("token") or m.get("id") or m.get("orderId")
            if not tok or tok in seen_tokens:
                continue
            seen_tokens.add(str(tok))
            merged.append(m)
            added += 1
        log(f"    · {deal_type}/{city_name} {lo}-{hi}: {len(sub)} raw, +{added} new")
    log(f"  ⚠ {deal_type}/{city_name}: subdivision returned {len(merged)} total "
        f"(vs 200 capped)")
    return merged, yad1


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    log("=" * 60)
    log("BebKey Yad2 Direct API Scraper starting")
    log(f"Cities: {len(CITIES)} | Deal types: {len(DEAL_TYPES)} | Concurrency: {CONCURRENCY}")
    log("=" * 60)

    sem = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(headers=HEADERS, http2=False, timeout=30, follow_redirects=True) as client:
        existing = await preload_existing_urls(client)

        async def do_one(deal_url, deal_type, city_name, city_id, area_id, region_id):
            async with sem:
                markers, yad1 = await fetch_city(
                    client, deal_url, deal_type, city_name, city_id, region_id,
                )
            rows = []        # regular listings
            proj_rows = []   # new-construction projects (DIFFERENT key shape)
            for m in markers:
                row = parse_marker(m, deal_type)
                if not row or row["source_url"] in existing:
                    continue
                existing.add(row["source_url"])
                rows.append(row)
            # New-construction projects (forsale only; rent responses carry none)
            for m in yad1:
                row = parse_yad1_marker(m)
                if not row or row["source_url"] in existing:
                    continue
                existing.add(row["source_url"])
                proj_rows.append(row)
            # IMPORTANT: upsert the two shapes in SEPARATE batches. PostgREST
            # bulk insert requires every object in a batch to have identical
            # keys (PGRST102 "All object keys must match"); project rows carry
            # `description` and omit the boolean feature flags, so mixing them
            # with regular rows 400s the whole batch (kills both).
            saved = 0
            if rows:
                saved += await upsert_batch(client, rows)
            if proj_rows:
                saved += await upsert_batch(client, proj_rows)
            if rows or proj_rows:
                proj_note = f", {len(proj_rows)} new-projects" if proj_rows else ""
                log(f"  ✓ {deal_type}/{city_name}: {saved} new (of {len(markers)} raw{proj_note})")
            return saved

        tasks = []
        for deal_url, deal_type in DEAL_TYPES:
            for city_name, city_id, area_id, region_id in CITIES:
                tasks.append(do_one(deal_url, deal_type, city_name, city_id, area_id, region_id))

        # Region-only sweep: catch listings not bound to any indexed city
        # (moshavim, kibbutzim, settlements).  city_id=0 → city param dropped,
        # bracket recursion still kicks in for the dense regions.
        for deal_url, deal_type in DEAL_TYPES:
            for region_id in ALL_REGIONS:
                label = f"region-{region_id}"
                tasks.append(do_one(deal_url, deal_type, label, 0, 0, region_id))

        results = await asyncio.gather(*tasks)
        total = sum(results)

    log("=" * 60)
    log(f"DONE - {total} new Yad2 listings saved via direct API")
    log("=" * 60)
    ping_dead_man("yad2_api")


if __name__ == "__main__":
    asyncio.run(main())
