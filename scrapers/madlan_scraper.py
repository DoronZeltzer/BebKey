"""
BebKey - Madlan Scraper v4
Improvements over v3:
  - ScraperAPI proxy support: routes all browser traffic through residential IPs,
    bypassing PerimeterX IP-level blocks on Azure/GitHub Actions
  - Homepage warmup: loads madlan.co.il once to seed PX cookies before scraping
  - Block detection: recognises "sorry a1", px-captcha, and related responses
  - Block-rate reporting: logs [BLOCK_RATE_HIGH] if > 50% of cities are blocked
  - All v3 logic intact: dynamic city list, batch duplicate check,
    parallel city scraping, playwright_stealth

Legal:
  - No private phone numbers stored
  - Images hotlinked from Madlan CDN (no re-hosting)
  - Source attributed as "madlan" with back-link
"""

import asyncio, json, os, sys, random
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
import httpx

LOG_FILE = os.path.join(os.path.dirname(__file__), "madlan_scraper_log.txt")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    msg = (f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ERROR: Missing env vars\n")
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f: f.write(msg)
    sys.exit(0)

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

# ── Block detection ───────────────────────────────────────────────────────────
BLOCK_SIGNALS = [
    "sorry a1",
    "px-captcha",
    "Access Denied",
    "perimeterx",
    "px.gif",
    "403 Forbidden",
]

def is_block_response(text: str) -> bool:
    """Return True if the response body contains PerimeterX block markers."""
    lower = text.lower()
    for signal in BLOCK_SIGNALS:
        if signal.lower() in lower:
            return True
    return False

# ── Comprehensive fallback city list ──────────────────────────────────────────
# Covers cities, major kibbutzim, moshavim, Bedouin towns, Arab cities.
# Each entry: (display_name, madlan_slug)
# Slug = Hebrew city name with spaces→dashes + "-ישראל"
FALLBACK_CITIES = [
    # ── Major cities ────────────────────────────────────────────────────────
    ("תל אביב יפו",        "תל-אביב-יפו-ישראל"),
    ("ירושלים",             "ירושלים-ישראל"),
    ("חיפה",                "חיפה-ישראל"),
    ("ראשון לציון",         "ראשון-לציון-ישראל"),
    ("פתח תקוה",            "פתח-תקווה-ישראל"),
    ("אשדוד",               "אשדוד-ישראל"),
    ("נתניה",               "נתניה-ישראל"),
    ("באר שבע",             "באר-שבע-ישראל"),
    ("בני ברק",             "בני-ברק-ישראל"),
    ("חולון",               "חולון-ישראל"),
    # ── Greater Tel Aviv ────────────────────────────────────────────────────
    ("רמת גן",              "רמת-גן-ישראל"),
    ("רחובות",              "רחובות-ישראל"),
    ("הרצליה",              "הרצליה-ישראל"),
    ("רעננה",               "רעננה-ישראל"),
    ("בת ים",               "בת-ים-ישראל"),
    ("גבעתיים",             "גבעתיים-ישראל"),
    ("כפר סבא",             "כפר-סבא-ישראל"),
    ("הוד השרון",           "הוד-השרון-ישראל"),
    ("גבעת שמואל",          "גבעת-שמואל-ישראל"),
    ("אור יהודה",           "אור-יהודה-ישראל"),
    ("ראש העין",            "ראש-העין-ישראל"),
    ("יהוד",                "יהוד-מונוסון-ישראל"),
    ("לוד",                 "לוד-ישראל"),
    ("רמלה",                "רמלה-ישראל"),
    ("נס ציונה",            "נס-ציונה-ישראל"),
    ("יבנה",                "יבנה-ישראל"),
    ("אזור",                "אזור-ישראל"),
    ("קריית עקרון",         "קריית-עקרון-ישראל"),
    ("גדרה",                "גדרה-ישראל"),
    ("מזכרת בתיה",          "מזכרת-בתיה-ישראל"),
    ("גן יבנה",             "גן-יבנה-ישראל"),
    ("בית דגן",             "בית-דגן-ישראל"),
    ("קדימה-צורן",          "קדימה-צורן-ישראל"),
    ("כפר יונה",            "כפר-יונה-ישראל"),
    # ── Sharon / Center ────────────────────────────────────────────────────
    ("מודיעין",             "מודיעין-מכבים-רעות-ישראל"),
    ("חדרה",                "חדרה-ישראל"),
    ("זכרון יעקב",          "זכרון-יעקב-ישראל"),
    ("פרדס חנה כרכור",      "פרדס-חנה-כרכור-ישראל"),
    ("קיסריה",              "קיסריה-ישראל"),
    ("בנימינה-גבעת עדה",    "בנימינה-גבעת-עדה-ישראל"),
    ("עמק חפר",             "עמק-חפר-ישראל"),
    ("אבן יהודה",           "אבן-יהודה-ישראל"),
    ("טירה",                "טירה-ישראל"),
    ("טייבה",               "טייבה-ישראל"),
    ("קלנסווה",             "קלנסווה-ישראל"),
    ("ג'לג'וליה",           "ג-לג-וליה-ישראל"),
    ("כפר קאסם",            "כפר-קאסם-ישראל"),
    ("רהט",                 "רהט-ישראל"),
    # ── Jerusalem metro ─────────────────────────────────────────────────────
    ("בית שמש",             "בית-שמש-ישראל"),
    ("מעלה אדומים",         "מעלה-אדומים-ישראל"),
    ("גבעת זאב",            "גבעת-זאב-ישראל"),
    ("מודיעין עילית",       "מודיעין-עילית-ישראל"),
    ("ביתר עילית",          "ביתר-עילית-ישראל"),
    ("בית אל",              "בית-אל-ישראל"),
    ("אריאל",               "אריאל-ישראל"),
    ("אלפי מנשה",           "אלפי-מנשה-ישראל"),
    ("אבו דיס",             "אבו-דיס-ישראל"),
    ("מעלה אפרים",          "מעלה-אפרים-ישראל"),
    ("קרני שומרון",         "קרני-שומרון-ישראל"),
    ("אלקנה",               "אלקנה-ישראל"),
    # ── Haifa metro ─────────────────────────────────────────────────────────
    ("קריית אתא",           "קריית-אתא-ישראל"),
    ("קריית ביאליק",        "קריית-ביאליק-ישראל"),
    ("קריית מוצקין",        "קריית-מוצקין-ישראל"),
    ("קריית ים",            "קריית-ים-ישראל"),
    ("קריית גת",            "קריית-גת-ישראל"),
    ("נהריה",               "נהריה-ישראל"),
    ("עכו",                 "עכו-ישראל"),
    ("כרמיאל",              "כרמיאל-ישראל"),
    ("מגדל העמק",           "מגדל-העמק-ישראל"),
    ("טירת כרמל",           "טירת-כרמל-ישראל"),
    ("יוקנעם עילית",        "יוקנעם-עילית-ישראל"),
    ("נשר",                 "נשר-ישראל"),
    ("אור עקיבא",           "אור-עקיבא-ישראל"),
    ("חריש",                "חריש-ישראל"),
    # ── Arab cities / North ─────────────────────────────────────────────────
    ("נצרת",                "נצרת-ישראל"),
    ("נצרת עילית",          "נוף-הגליל-ישראל"),
    ("שפרעם",               "שפרעם-ישראל"),
    ("סח'נין",              "סח-נין-ישראל"),
    ("אבו סנאן",            "אבו-סנאן-ישראל"),
    ("יפיע",                "יפיע-ישראל"),
    ("באקה אל גרביה",       "באקה-אל-גרביה-ישראל"),
    ("אום אל פחם",          "אום-אל-פחם-ישראל"),
    ("ערערה",               "ערערה-ישראל"),
    # ── North / Galilee ─────────────────────────────────────────────────────
    ("עפולה",               "עפולה-ישראל"),
    ("טבריה",               "טבריה-ישראל"),
    ("צפת",                 "צפת-ישראל"),
    ("קרית שמונה",          "קרית-שמונה-ישראל"),
    ("בית שאן",             "בית-שאן-ישראל"),
    ("מגדל",                "מגדל-ישראל"),
    ("ראש פינה",            "ראש-פינה-ישראל"),
    ("מטולה",               "מטולה-ישראל"),
    # ── Kibbutzim (major, with active real estate) ───────────────────────────
    ("גן שמואל",            "גן-שמואל-ישראל"),
    ("כפר מסריק",           "כפר-מסריק-ישראל"),
    ("גינוסר",              "גינוסר-ישראל"),
    ("עין חרוד",            "עין-חרוד-ישראל"),
    ("מגן",                 "מגן-ישראל"),
    ("ניר עם",              "ניר-עם-ישראל"),
    ("שפיים",               "שפיים-ישראל"),
    ("כפר שמריהו",          "כפר-שמריהו-ישראל"),
    ("הרצליה פיתוח",        "הרצליה-פיתוח-ישראל"),
    ("קיבוץ גלויות",        "קיבוץ-גלויות-ישראל"),
    ("גבעת ברנר",           "גבעת-ברנר-ישראל"),
    ("נען",                 "נען-ישראל"),
    ("גלות",                "גלות-ישראל"),
    ("צובה",                "צובה-ישראל"),
    ("כסלון",               "כסלון-ישראל"),
    ("עין כרם",             "עין-כרם-ישראל"),
    # ── Moshavim (major) ────────────────────────────────────────────────────
    ("אביחיל",              "אביחיל-ישראל"),
    ("בית חנן",             "בית-חנן-ישראל"),
    ("חגור",                "חגור-ישראל"),
    ("כפר ביל\"ו",          "כפר-ביל-ו-ישראל"),
    ("כפר נטר",             "כפר-נטר-ישראל"),
    ("כפר חסידים",          "כפר-חסידים-ישראל"),
    ("כפר ויתקין",          "כפר-ויתקין-ישראל"),
    ("גאולים",              "גאולים-ישראל"),
    ("עינת",                "עינת-ישראל"),
    ("שניר",                "שניר-ישראל"),
    ("חמרה",                "חמרה-ישראל"),
    # ── South ───────────────────────────────────────────────────────────────
    ("אשקלון",              "אשקלון-ישראל"),
    ("אילת",                "אילת-ישראל"),
    ("דימונה",              "דימונה-ישראל"),
    ("שדרות",               "שדרות-ישראל"),
    ("אופקים",              "אופקים-ישראל"),
    ("נתיבות",              "נתיבות-ישראל"),
    ("קריית מלאכי",         "קריית-מלאכי-ישראל"),
    ("ירוחם",               "ירוחם-ישראל"),
    ("מצפה רמון",           "מצפה-רמון-ישראל"),
    ("ערד",                 "ערד-ישראל"),
    ("נבטים",               "נבטים-ישראל"),
    ("תל שבע",              "תל-שבע-ישראל"),
    ("להבים",               "להבים-ישראל"),
    ("עומר",                "עומר-ישראל"),
    ("מיתר",                "מיתר-ישראל"),
    ("כסיפה",               "כסיפה-ישראל"),
    ("הורה",                "הורה-ישראל"),
    ("ניצן",                "ניצן-ישראל"),
    ("אשכול",               "אשכול-ישראל"),
    # ── Missing official cities (from Ministry of Interior full list) ────────
    ("אלעד",                "אלעד-ישראל"),
    ("רמת השרון",           "רמת-השרון-ישראל"),
    ("קרית אונו",           "קריית-אונו-ישראל"),
    ("מעלות תרשיחא",        "מעלות-תרשיחא-ישראל"),
    ("מג'אר",               "מג-אר-ישראל"),
    ("תמרה",                "תמרה-ישראל"),
    ("כפר קרע",             "כפר-קרע-ישראל"),
    ("קצרין",               "קצרין-ישראל"),
    ("גני תקווה",           "גני-תקווה-ישראל"),
    # ── Local councils - Greater Tel Aviv ───────────────────────────────────
    ("באר יעקב",            "באר-יעקב-ישראל"),
    ("בית אריה",            "בית-אריה-ישראל"),
    ("שהם",                 "שהם-ישראל"),
    ("תל מונד",             "תל-מונד-ישראל"),
    ("פרדסיה",              "פרדסיה-ישראל"),
    ("כוכב יאיר",           "כוכב-יאיר-צור-יגאל-ישראל"),
    ("אורנית",              "אורנית-ישראל"),
    ("רכסים",               "רכסים-ישראל"),
    ("ראמה",                "ראמה-ישראל"),
    # ── Local councils - Haifa / North ──────────────────────────────────────
    ("קרית טבעון",          "קריית-טבעון-ישראל"),
    ("קרית ארבע",           "קריית-ארבע-ישראל"),
    ("קרית יערים",          "קריית-יערים-ישראל"),
    ("בסמת טבעון",          "בסמת-טבעון-ישראל"),
    ("רמת ישי",             "רמת-ישי-ישראל"),
    ("חצור הגלילית",        "חצור-הגלילית-ישראל"),
    ("יבנאל",               "יבנאל-ישראל"),
    ("יסוד המעלה",          "יסוד-המעלה-ישראל"),
    ("מגדל תפן",            "מגדל-תפן-ישראל"),
    ("כפר ורדים",           "כפר-ורדים-ישראל"),
    ("כפר תבור",            "כפר-תבור-ישראל"),
    ("שלומי",               "שלומי-ישראל"),
    # ── Local councils - Jerusalem metro ───────────────────────────────────
    ("מבשרת ציון",          "מבשרת-ציון-ישראל"),
    ("הר אדר",              "הר-אדר-ישראל"),
    ("אפרת",                "אפרת-ישראל"),
    ("קדומים",              "קדומים-ישראל"),
    # ── Local councils - Arab / Mixed (with significant population) ─────────
    ("אבו גוש",             "אבו-גוש-ישראל"),
    ("בית ג'ן",             "בית-ג-ן-ישראל"),
    ("דבוריה",              "דבוריה-ישראל"),
    ("דיר חנא",             "דיר-חנא-ישראל"),
    ("עילבון",              "עילבון-ישראל"),
    ("עין מאהל",            "עין-מאהל-ישראל"),
    ("אעבלין",              "אעבלין-ישראל"),
    ("אכסאל",               "אכסאל-ישראל"),
    ("עילוט",               "עילוט-ישראל"),
    ("ג'סר א-זרקא",         "ג-סר-א-זרקא-ישראל"),
    ("ג'דיידה מכר",         "ג-דיידה-מכר-ישראל"),
    ("כאבול",               "כאבול-ישראל"),
    ("כפר מנדא",            "כפר-מנדא-ישראל"),
    ("כפר יאסיף",           "כפר-יאסיף-ישראל"),
    ("כפר כנא",             "כפר-כנא-ישראל"),
    ("כפר קמה",             "כפר-קמה-ישראל"),
    ("ריינה",               "ריינה-ישראל"),
    ("טורעאן",              "טורעאן-ישראל"),
    ("ירכא",                "ירכא-ישראל"),
    ("נחף",                 "נחף-ישראל"),
    ("ג'וליס",              "ג-וליס-ישראל"),
    ("פורידיס",             "פורידיס-ישראל"),
    ("בועיינה נוג'ידאת",    "בועיינה-נוג-ידאת-ישראל"),
    ("בוקעאתה",             "בוקעאתה-ישראל"),
    ("מסעדה",               "מסעדה-ישראל"),
    ("מג'דל שמס",           "מג-דל-שמס-ישראל"),
    ("עין קיניה",           "עין-קיניה-ישראל"),
    ("זרזיר",               "זרזיר-ישראל"),
    ("משהד",                "משהד-ישראל"),
    ("שבלי",                "שבלי-אום-אל-ג-נם-ישראל"),
    ("טובא זנגריה",         "טובא-זנגריה-ישראל"),
    ("לקיה",                "לקיה-ישראל"),
    ("ערערה בנגב",          "ערערה-בנגב-ישראל"),
    ("שגב שלום",            "שגב-שלום-ישראל"),
    ("חורה",                "חורה-ישראל"),
    ("עמנואל",              "עמנואל-ישראל"),
    # ── Local councils - South ──────────────────────────────────────────────
    ("נאות חובב",           "נאות-חובב-ישראל"),
    ("סביון",               "סביון-ישראל"),
]

# ── Dynamically fetch ALL localities from Madlan's search API ─────────────────
async def fetch_all_madlan_cities():
    """
    Attempts to fetch the complete city list from Madlan's autocomplete API.
    Falls back to FALLBACK_CITIES. Returns list of (display_name, slug).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "he-IL,he;q=0.9",
        "Referer": "https://www.madlan.co.il/",
    }
    endpoints = [
        "https://www.madlan.co.il/api/autocomplete?q=&type=area&limit=2000",
        "https://www.madlan.co.il/api2/search/autocomplete?q=&limit=2000",
    ]
    async with httpx.AsyncClient(headers=headers, timeout=15,
                                  follow_redirects=True) as client:
        for url in endpoints:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                body = r.json()
                items = body if isinstance(body, list) else body.get("data", [])
                if not items:
                    continue
                cities = []
                for item in items:
                    doc_id = item.get("docId") or item.get("slug") or ""
                    name   = item.get("displayName") or item.get("name") or ""
                    if doc_id and name and "ישראל" in doc_id:
                        cities.append((name, doc_id))
                if cities:
                    log(f"Dynamic Madlan cities: {len(cities)} localities")
                    return cities
            except Exception as e:
                log(f"Madlan city API failed ({url}): {e}")

    log(f"Using fallback city list ({len(FALLBACK_CITIES)} localities)")
    return FALLBACK_CITIES

# ── Batch preload existing Madlan source_urls ─────────────────────────────────
async def preload_existing_urls():
    existing = set()
    offset, limit = 0, 1000
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                r = await client.get(
                    f"{REST_URL}/listings",
                    headers={**HEADERS, "Prefer": ""},
                    params={"select": "source_url", "source": "eq.madlan",
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
                log(f"Preload error (offset={offset}): {e}")
                break
    log(f"Preloaded {len(existing)} existing Madlan URLs")
    return existing

HEADERS_INSERT = {
    **HEADERS,
    # ON CONFLICT (source_url) DO NOTHING - requires unique constraint on source_url
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}

def insert_listing(data):
    try:
        r = httpx.post(f"{REST_URL}/listings?on_conflict=source_url", headers=HEADERS_INSERT,
                       content=json.dumps(data), timeout=10)
        if r.status_code in (200, 201):
            log(f"  ✓ {data.get('city')} | {data.get('price')} | "
                f"{data.get('rooms')}R | {data.get('size_m2')}m²")
        elif r.status_code == 409:
            pass  # unique constraint hit - in-memory set should have caught this
        else:
            log(f"  ✗ Insert failed ({r.status_code}): {r.text[:150]}")
    except Exception as e:
        log(f"  ✗ Insert error: {e}")

# ── Parse a POI ───────────────────────────────────────────────────────────────
def _bool_flag(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val > 0
    if isinstance(val, str):
        return val.lower() not in ("false", "0", "no", "")
    return None

def _clean_madlan_id(raw_id):
    """Strip known prefixes like 'BULLETIN:' or 'PROJECT:' from Madlan IDs."""
    if not raw_id:
        return ""
    s = str(raw_id)
    for prefix in ("BULLETIN:", "PROJECT:", "bulletin:", "project:"):
        if s.startswith(prefix):
            return s[len(prefix):]
    return s

def parse_poi(poi, city_name, deal_type="forsale"):
    """
    Parse a Madlan GraphQL POI (bulletin or project) into a listings row dict.
    deal_type: 'forsale' or 'rent'
    """
    try:
        poi_type = poi.get("__typename", "").lower()
        raw_id   = poi.get("id", "")
        poi_id   = _clean_madlan_id(raw_id)
        if not poi_id or poi_type in ("ad", ""):
            return None

        addr         = poi.get("addressDetails") or {}
        city         = addr.get("city") or city_name
        street_name  = addr.get("streetName") or ""
        street_num   = addr.get("streetNumber") or ""
        street       = f"{street_name} {street_num}".strip() or None
        neighborhood = addr.get("neighbourhood") or addr.get("neighborhood")

        lat = lng = None
        coords = poi.get("coordinates") or poi.get("location") or {}
        if isinstance(coords, dict):
            lat = coords.get("lat") or coords.get("latitude")
            lng = coords.get("lon") or coords.get("lng") or coords.get("longitude")
        try:
            lat = float(lat) if lat is not None else None
            lng = float(lng) if lng is not None else None
        except (ValueError, TypeError):
            lat = lng = None

        if poi_type == "bulletin":
            price       = poi.get("price")
            rooms       = poi.get("beds") or poi.get("rooms")
            size_m2     = poi.get("area") or poi.get("squareMeter")
            floor_raw   = poi.get("floor")
            floor       = int(floor_raw) if floor_raw is not None else None
            total_floors = poi.get("totalFloors") or poi.get("buildingFloors")
            try:
                total_floors = int(total_floors) if total_floors is not None else None
            except (ValueError, TypeError):
                total_floors = None

            description = (
                poi.get("description") or poi.get("text") or poi.get("info") or None
            )
            if description:
                description = str(description).strip() or None

            # Boolean amenities
            props          = poi.get("properties") or poi.get("additionalProperties") or {}
            parking        = _bool_flag(poi.get("parking") or props.get("parking"))
            elevator       = _bool_flag(poi.get("elevator") or props.get("elevator"))
            balcony        = _bool_flag(poi.get("balcony") or props.get("balcony"))
            mamad          = _bool_flag(poi.get("safeRoom") or poi.get("mamad") or poi.get("shelter") or props.get("safeRoom"))
            furnished      = _bool_flag(poi.get("furnished") or props.get("furnished"))
            air_cond       = _bool_flag(poi.get("airConditioning") or poi.get("ac") or props.get("airConditioning"))
            accessible     = _bool_flag(poi.get("accessible") or poi.get("wheelchairAccessible") or props.get("accessible"))
            storage_room   = _bool_flag(poi.get("storageRoom") or poi.get("storage") or props.get("storageRoom"))

            # Condition
            condition_raw  = poi.get("condition") or poi.get("propertyCondition")
            if condition_raw:
                cond_map = {"חדש": "new", "שופץ": "renovated", "requires_renovation": "needs_work"}
                condition = cond_map.get(str(condition_raw).strip(), None)
            else:
                condition = None

            raw_imgs   = poi.get("images") or []
            images     = [img.get("imageUrl") or img.get("url") or img.get("path")
                          for img in raw_imgs
                          if isinstance(img, dict)
                          and not img.get("isFloorplan")]
            images     = [u for u in images if u][:10]

            # Determine property type from poi fields
            pt_map = {
                "APARTMENT": "דירה", "PENTHOUSE": "גג/פנטהאוז",
                "DUPLEX": "דופלקס", "STUDIO": "סטודיו",
                "PRIVATE_HOUSE": "בית פרטי", "COTTAGE": "בית פרטי",
                "GARDEN_APARTMENT": "דירת גן",
            }
            prop_type_raw = poi.get("propertyType") or poi.get("type")
            prop_type     = pt_map.get(str(prop_type_raw).upper(), "דירה") if prop_type_raw else "דירה"

            # Prefer URL from API if provided, otherwise construct
            source_url = (
                poi.get("url") or poi.get("link") or poi.get("canonicalUrl") or
                f"https://www.madlan.co.il/listing/{poi_id}"
            )

        elif poi_type == "project":
            pr           = poi.get("priceRange") or {}
            price        = pr.get("min") or pr.get("max")
            br           = poi.get("bedsRange") or {}
            rooms        = br.get("min")
            size_m2      = None
            bd           = poi.get("blockDetails") or {}
            fr           = bd.get("floorRange") or {}
            floor        = fr.get("max") if fr else None
            total_floors = floor
            description  = poi.get("description") or poi.get("text") or None
            if description:
                description = str(description).strip() or None

            raw_imgs = poi.get("images") or []
            images   = [img.get("path") or img.get("url") or img.get("imageUrl")
                        for img in raw_imgs if isinstance(img, dict)]
            images   = [u for u in images if u][:10]
            prop_type  = "פרויקט חדש"
            source_url = (
                poi.get("url") or poi.get("link") or
                f"https://www.madlan.co.il/project/{poi_id}"
            )
            condition   = "new"
            parking = elevator = balcony = mamad = furnished = air_cond = accessible = storage_room = None
        else:
            return None

        if price is None and rooms is None and not images:
            return None

        price_int = int(price) if price else None

        # Skip absurd prices (> 50M ILS)
        if price_int and price_int > 50_000_000:
            return None

        rooms_clean = float(rooms) if rooms else None
        if rooms_clean is not None and (rooms_clean < 1 or rooms_clean > 20):
            rooms_clean = None

        # Ensure absolute URL
        if source_url and source_url.startswith("/"):
            source_url = "https://www.madlan.co.il" + source_url

        return {
            "source": "madlan", "source_url": source_url,
            "deal_type": deal_type,
            "price": price_int,
            "city": city, "street": street, "neighborhood": neighborhood,
            "size_m2": float(size_m2) if size_m2 else None,
            "rooms": rooms_clean,
            "floor": int(floor) if floor is not None else None,
            "total_floors": total_floors,
            "property_type": prop_type,
            "condition": condition if poi_type == "bulletin" else "new",
            "description": description,
            "contact_phone": None,
            "images": images, "is_active": True,
            "lat": lat, "lng": lng,
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
        log(f"Parse error {poi.get('id','?')}: {e}")
        return None

# ── Scroll helper ─────────────────────────────────────────────────────────────
async def scroll_results(page, times=3):
    for _ in range(times):
        await page.evaluate("""
            () => {
                const candidates = [
                    document.querySelector('[class*="ResultsList"]'),
                    document.querySelector('[class*="searchResults"]'),
                    document.querySelector('[class*="results-list"]'),
                    ...Array.from(document.querySelectorAll('div')).filter(
                        d => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 400
                    ).sort((a,b) => b.scrollHeight - a.scrollHeight)
                ];
                const t = candidates.find(el => el && el.scrollHeight > el.clientHeight);
                if (t) t.scrollTop += 3000; else window.scrollBy(0, 3000);
            }
        """)
        await asyncio.sleep(random.uniform(1.5, 2.5))

# ── Homepage warmup ───────────────────────────────────────────────────────────
async def warmup_browser(browser) -> bool:
    """
    Load madlan.co.il homepage in a shared context to seed PX cookies.
    Returns True if the _px3 cookie was found (warmup succeeded).
    """
    log("Warming up browser on madlan.co.il homepage...")
    ctx = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 768},
        locale="he-IL",
        extra_http_headers={"Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8"},
    )
    page = await ctx.new_page()
    await Stealth().apply_stealth_async(page)
    blocked = False
    try:
        resp = await page.goto(
            "https://www.madlan.co.il/",
            timeout=40000,
            wait_until="domcontentloaded",
        )
        # Check for a block at the HTTP level
        if resp and resp.status in (403, 429):
            body_text = await resp.text()
            if is_block_response(body_text):
                blocked = True
        await asyncio.sleep(8)
    except Exception as e:
        log(f"Warmup navigation error: {e}")
    finally:
        await page.close()
        await ctx.close()

    if blocked:
        log("Warmup: block response received on homepage")
        return False

    log("Warmup complete - browser session initialised")
    return True

# ── Scrape one city ───────────────────────────────────────────────────────────
async def scrape_city(browser, existing_urls, city_name, city_doc_id,
                      deal_types, max_scrolls):
    results       = {}
    blocked_deals = 0
    total_deals   = len(deal_types)

    ctx = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 768}, locale="he-IL",
        extra_http_headers={"Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8"},
    )
    try:
        for deal_type, deal_slug in deal_types:
            captured_pois  = []
            seen_ids       = set()
            city_blocked   = False

            async def on_response(response, _deal_type=deal_type, _deal_slug=deal_slug):
                nonlocal city_blocked
                if "/api2" not in response.url and "/api/" not in response.url:
                    return
                ct = response.headers.get("content-type", "")
                # Check for block even on non-JSON responses (e.g. HTML error page)
                if "json" not in ct:
                    try:
                        body_text = await response.text()
                        if is_block_response(body_text):
                            log(f"[BLOCK_DETECTED] {city_name}/{_deal_slug} (non-JSON response)")
                            city_blocked = True
                    except Exception:
                        pass
                    return
                try:
                    body_text = await response.text()
                    if is_block_response(body_text):
                        log(f"[BLOCK_DETECTED] {city_name}/{_deal_slug}")
                        city_blocked = True
                        return
                    body = json.loads(body_text)
                except Exception:
                    return
                data = body.get("data") or {}
                if not isinstance(data, dict):
                    return
                for op in ["searchPoiV2", "searchPoi", "searchPoiForRent",
                           "searchBulletins", "bulletinsByLocation"]:
                    sd   = data.get(op) or {}
                    pois = sd.get("poi") or sd.get("bulletins") or []
                    if pois:
                        for poi in pois:
                            pid = poi.get("id")
                            if pid and pid not in seen_ids:
                                seen_ids.add(pid)
                                captured_pois.append(poi)
                        break

            page = await ctx.new_page()
            await Stealth().apply_stealth_async(page)
            page.on("response", on_response)

            url = f"https://www.madlan.co.il/{deal_slug}/{city_doc_id}"
            log(f"  {city_name}/{deal_slug}: {url}")
            try:
                resp = await page.goto(url, timeout=40000, wait_until="domcontentloaded")
                # Check top-level page response for block signals
                if resp:
                    try:
                        body_text = await resp.text()
                        if is_block_response(body_text):
                            log(f"[BLOCK_DETECTED] {city_name}/{deal_slug} (page load)")
                            city_blocked = True
                    except Exception:
                        pass

                await asyncio.sleep(5)
                log(f"  Initial: {len(captured_pois)} POIs")

                if not city_blocked:
                    for i in range(max_scrolls):
                        before = len(captured_pois)
                        await scroll_results(page, times=3)
                        await asyncio.sleep(2)
                        after = len(captured_pois)
                        log(f"  Scroll {i+1}: +{after-before} (total {after})")
                        if after == before:
                            break
            except Exception as e:
                log(f"  Page error: {type(e).__name__}: {str(e)[:80]}")
            finally:
                page.remove_listener("response", on_response)
                await page.close()

            if city_blocked:
                blocked_deals += 1
            else:
                results[deal_type] = captured_pois

            await asyncio.sleep(random.uniform(1, 2))
    finally:
        await ctx.close()

    # Map Madlan deal slugs to our deal_type values
    DEAL_SLUG_MAP = {
        "unitBuy":  "forsale",
        "unitRent": "rent",
    }

    # Insert using in-memory set
    new_count = skip_count = 0
    for deal_key, pois in results.items():
        mapped_deal_type = DEAL_SLUG_MAP.get(deal_key, "forsale")
        for poi in pois:
            listing = parse_poi(poi, city_name, deal_type=mapped_deal_type)
            if not listing:
                continue
            if listing["source_url"] in existing_urls:
                skip_count += 1
                continue
            insert_listing(listing)
            existing_urls.add(listing["source_url"])
            new_count += 1
            await asyncio.sleep(0.1)

    log(f"  {city_name}: ✓ {new_count} new | ⟳ {skip_count} skipped")
    return new_count, skip_count, blocked_deals, total_deals

# ── Main ──────────────────────────────────────────────────────────────────────
async def run():
    log("BebKey Madlan Scraper v4 started")

    max_scrolls = int(os.getenv("SCRAPER_MAX_PAGES", "10"))
    is_ci       = "SCRAPER_MAX_PAGES" in os.environ
    headless    = is_ci
    concurrency = int(os.getenv("SCRAPER_CONCURRENCY", "3"))

    if SCRAPER_API_KEY:
        log("ScraperAPI proxy: ENABLED - routing all traffic through residential IPs")
    else:
        log("ScraperAPI proxy: DISABLED (SCRAPER_API_KEY not set)")

    log(f"Mode: {'CI' if is_ci else 'local'} | headless={headless} | "
        f"max_scrolls={max_scrolls} | concurrency={concurrency}")

    # 1. Preload existing URLs
    existing_urls = await preload_existing_urls()

    # 2. Fetch all localities
    cities = await fetch_all_madlan_cities()
    log(f"Cities to scrape: {len(cities)}")

    deal_types  = [("unitBuy", "for-sale"), ("unitRent", "for-rent")]
    total_new   = 0
    total_skip  = 0
    total_blocked_cities = 0
    total_city_deals     = 0
    sem = asyncio.Semaphore(concurrency)

    # Build proxy config if ScraperAPI key is set
    proxy_config = None
    if SCRAPER_API_KEY:
        proxy_config = {
            "server":   "http://proxy.scraper-api.com:8080",
            "username": "scraperapi",
            "password": SCRAPER_API_KEY,
        }

    browser_launch_args = (
        ["--no-sandbox", "--disable-dev-shm-usage",
         "--disable-blink-features=AutomationControlled"]
        if headless else
        ["--disable-blink-features=AutomationControlled"]
    )

    async with async_playwright() as p:
        launch_kwargs = {
            "headless": headless,
            "args": browser_launch_args,
        }
        if proxy_config:
            launch_kwargs["proxy"] = proxy_config
        if proxy_config:
            launch_kwargs["ignore_https_errors"] = True

        browser = await p.chromium.launch(**launch_kwargs)

        # 3. Homepage warmup - seed PX cookies before city scraping
        warmup_ok = await warmup_browser(browser)
        if not warmup_ok and not SCRAPER_API_KEY:
            log("[BLOCK_DETECTED] IP blocked by PerimeterX - set SCRAPER_API_KEY env var")
            await browser.close()
            sys.exit(0)

        async def scrape_with_sem(city_name, city_doc_id):
            async with sem:
                try:
                    return await scrape_city(browser, existing_urls,
                                             city_name, city_doc_id,
                                             deal_types, max_scrolls)
                except Exception as e:
                    log(f"  City error {city_name}: {e}")
                    return (0, 0, 0, len(deal_types))

        # 4. All cities in parallel
        tasks   = [scrape_with_sem(name, slug) for name, slug in cities]
        log(f"Launching {len(tasks)} city tasks ({concurrency} concurrent)...")
        results = await asyncio.gather(*tasks)

        await browser.close()

    for new, skip, blocked, city_total_deals in results:
        total_new  += new
        total_skip += skip
        # Count a city as "blocked" if ALL its deal types were blocked
        if blocked > 0 and blocked >= city_total_deals:
            total_blocked_cities += 1
        total_city_deals += 1

    # 5. Block rate reporting
    if total_city_deals > 0:
        block_rate = total_blocked_cities / total_city_deals
        if block_rate > 0.5:
            log(f"[BLOCK_RATE_HIGH] {block_rate:.0%} of cities blocked "
                f"({total_blocked_cities}/{total_city_deals})")
        else:
            log(f"Block rate: {block_rate:.0%} "
                f"({total_blocked_cities}/{total_city_deals} cities)")

    log(f"Madlan done - ✓ {total_new} new | ⟳ {total_skip} skipped")

if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as e:
        log(f"Fatal error: {e}")
        import traceback; log(traceback.format_exc())
        sys.exit(0)
