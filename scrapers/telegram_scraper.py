"""
BebKey - Telegram Real-Estate Channel Scraper

Reads Israeli real-estate Telegram channels and extracts listings from messages.
Many of these channels post listings hours/days before they hit Yad2/Madlan,
giving BebKey users a real edge.

Requires (set as GitHub Secrets):
  TELEGRAM_API_ID        - integer, obtained at https://my.telegram.org/apps
  TELEGRAM_API_HASH      - string,  obtained at https://my.telegram.org/apps
  TELEGRAM_SESSION       - string,  StringSession (generate locally - see README below)

  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

HOW TO GENERATE TELEGRAM_SESSION (one-time, do locally):
  pip install telethon
  python -c "
  from telethon.sync import TelegramClient
  from telethon.sessions import StringSession
  api_id   = <YOUR_API_ID>
  api_hash = '<YOUR_API_HASH>'
  with TelegramClient(StringSession(), api_id, api_hash) as c:
      print(c.session.save())
  "
  -> Paste the printed string into GitHub Secrets as TELEGRAM_SESSION.

This script will run non-interactively in CI using that session string.

Legal note:
  - Only public channels (joined by link) are read
  - No phone numbers stored in description
  - Listings credited "telegram" with channel link + message ID
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx
from quality import enrich
from monitoring import init_sentry

init_sentry("telegram")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "telegram_scraper_log.txt")

# ── Env ───────────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TG_API_ID       = os.getenv("TELEGRAM_API_ID", "")
TG_API_HASH     = os.getenv("TELEGRAM_API_HASH", "")
TG_SESSION      = os.getenv("TELEGRAM_SESSION", "")

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# Telethon is imported lazily inside main() so this module stays
# importable (for scripts/tg_probe_channels.py) even when telethon
# isn't installed or creds are missing.

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# ── Channels to monitor ───────────────────────────────────────────────────────
# Curated list of Israeli real-estate Telegram channels.
#   - Channels marked VERIFIED were sourced from telegram-group.com/נדלן/
#     directory and individually confirmed to exist (May 2026).
#   - Channels marked GUESS follow the @ILRents<City> naming pattern of the
#     IL Rents network - the scraper soft-fails on missing handles, so leaving
#     guesses in is harmless and may catch new channels as IL Rents adds cities.
#
# Set TELEGRAM_CHANNELS env var to override this list at runtime (comma-separated
# @-handles), useful for testing without code changes.
#
# Live as of 2026-05-21 probe.  18 previously-guessed @ILRents* city
# expansions were removed because the usernames don't exist (Telegram
# returned "No user has X as username").  The 13 below all resolve and
# return recent messages.
#
_DEFAULT_CHANNELS = [
    # =====================================================================
    # Pruned & expanded 2026-05-21 after running a 256-channel sweep.
    #
    # PRUNED: 213 speculative handles (@dirot_<city>, @kvartiri_<city>,
    # @nadlan_<city>, etc.) that resolved to "no such username" are gone.
    # Lesson learned: the `@<verb>_<city>` and `@<city>_<verb>` patterns
    # are mostly NOT used in real Israeli Telegram.  What does exist:
    # full word concatenations (@kvartirivnetanii), brand names
    # (@jeremy_public, @nikonadlanhaifa, @BROOTTO_Rent), and descriptive
    # boards (@Sublet_Israel, @Israel_Apartments).
    #
    # KEPT: 43 handles that resolved live in the production run.
    # ADDED: 52 new candidates from a second research pass (tlgrm.co.il
    # nedvijimost directory, tgstat.ru Israel category, telemetr.io,
    # specific brand searches).
    # =====================================================================

    # ── LIVE from prior run - Hebrew aggregators & national boards ────────
    "@dirot4rent",                # לוח ארצי - דירות להשכרה
    "@nadlantime",                # חדשות הנדל"ן + מודעות
    "@NadlanNews",                # חדשות נדל"ן
    "@TheAmericanDream555",       # Anglo / English-friendly board
    "@jeremy_public",             # ג'רמי - 21 listings/week ⭐
    "@nadlan_il",                 # Nadlan IL aggregator
    "@nadlan_israel",             # Nadlan Israel aggregator
    "@israelnadlan",              # Israel Nadlan
    "@israelrealestate",
    "@NadlanLive",
    "@Dirot_israel",
    "@HadiRot",
    "@Nadlan_Telaviv",

    # ── LIVE - IL Rents network (Yad2/Homeless re-publishers) ─────────────
    "@ILRentsTLV",
    "@ILRentsRishon",
    "@ILRentsHolon",
    "@ILRentsHerzliya",
    "@ILRentsRamatGan",
    "@ILRentsGivatayim",
    "@ILRentsHaifa",

    # ── LIVE - Hebrew city-specific ───────────────────────────────────────
    "@DirotKrayot",
    "@rent_in_rehovot",
    "@dirot_haifa",
    "@nadlan_haifa",

    # ── LIVE - Russian (FSU olim) ────────────────────────────────────────
    "@kvartirivnetanii",          # 5 listings ⭐
    "@nikonadlanhaifa",           # 8 listings/run ⭐ trilingual Haifa
    "@nedvizhimost_israel",       # Недвижимость Израиль
    "@ashdod_rent",               # Ashdod.Rent
    "@cometoisrael",              # SABLET TLV/Bat Yam
    "@arenda_telaviv",
    "@arenda_haifa",
    "@arenda_jerusalem",
    "@arenda_netanya",
    "@arenda_ashdod",
    "@arenda_krayot",
    "@haifa_rent",
    "@rent_in_haifa",
    "@Sublet_Israel",             # 33 listings/run ⭐⭐ biggest contributor
    "@israel_sublet",
    "@sablet_israel",
    "@Israel_Apartments",         # 6 listings/run ⭐
    "@israelapartments",

    # ── LIVE - English / Anglo ────────────────────────────────────────────
    "@TelAvivRentals",

    # =====================================================================
    # NEW CANDIDATES from 2nd research sweep (tlgrm.co.il, tgstat.ru,
    # telemetr.io, brand searches).  Will be sifted on next run.
    # =====================================================================

    # ── Aggregator brand channels ──────────────────────────────────────
    "@realta_rent_il",            # Realta - multi-source rental alerts
    "@Realta_IL",                 # Realta - news/updates feed
    "@apartment_il",              # הנודד - Hebrew apartment-hunt bot (TLV)
    "@dirot4sale",                # Luah1.co.il sales feed (sister to @dirot4rent)
    "@israel_nadlan_news",        # Недвижимость Израиля - RU real-estate news

    # ── Russian rental channels (Haifa-heavy; large FSU olim there) ────
    "@telaviv_appart",            # 2.9K members - TLV housing
    "@telaviv_arenda",            # 941 members - TLV
    "@Israel_arenda",             # 4.2K members - IL umbrella
    "@arendakvhaifa",             # 8.2K subs - LARGE Haifa rentals
    "@haifa_arenda",
    "@haifaarenda",
    "@HaifaRental",
    "@rentinhaifa",
    "@izrailrent",                # 1.5K subs - Haifa apartments
    "@rent_apartments_israel",
    "@kvartira_haifa",
    "@kvartiry_haifa",
    "@realestate_haifa",
    "@haifarentflats",
    "@HaifarenfsflatsroomsIsrsel",
    "@flat_israel",               # Haifa & Krayot
    "@brodsky_apartments",        # 2.8K subs - Haifa studios
    "@kvartiraisrael",            # IL classifieds
    "@rent_in_israel",            # ДИРА - rentals + sublet
    "@arenda_v_israel",           # North Israel
    "@arenda_israel1",
    "@rent_telaviv",              # English, TLV (small)
    "@renttelaviv",
    "@rent_haifa",
    "@Tlv4shortrent",             # SHaYaSH TLV short-term
    "@IsraelArenda",              # Nahariya (468 subs)

    # ── Hebrew rental channels ─────────────────────────────────────────
    "@dirotsapir",                # Sapir Krayot/Haifa (6.4K members)
    "@sapirrent",                 # Sapir variant (1.1K)
    "@telavivapartments",
    "@tlvapartments",             # שותפים (roommates)
    "@tlv_sublet",                # סאבלט תל אביב

    # ── Jeremy bot sister channels (since @jeremy_public is so productive) ─
    "@jeremy_public_herzliya",    # Herzliya
    "@jeremy_public_ramat_gan",   # Ramat Gan

    # ── BROOTTO ecosystem (large RU classifieds network) ───────────────
    "@BROOTTO",                   # parent - Доска Объявлений Израиля
    "@BROOTTO_Rent",              # known to exist (Аренда Израиль)
    "@BROOTTO_Sale",              # sales sister

    # ── Classifieds boards (large general-purpose with real-estate) ────
    "@Israel_Reklama",            # 10.6K members
    "@Haifa_ads",                 # 3.1K members

    # ── Real-estate news / sales / discussion ──────────────────────────
    "@OleRealty",                 # Ole Realty - RU news (1.4K)
    "@israel_homes",              # МИГДАЛЬ - TLV/Ramat Hasharon sales
    "@IL_RealEstate",             # נדל"ן Israel general
    "@nadlangroup",               # קבוצת הנדלן
    "@nadlan_group",              # נדלן למכירה
    "@dira_il",                   # דירה בהנחה - Mechir LaMishtaken

    # ── Olim / repatriant community channels (housing posts in chat) ───
    "@olehadash_com",             # OLE HADASH - 32K subs, Aliyah info
    "@israel_now",                # АЛИЯ - relocation + rentals (1.7K)
    "@repatriant_israel",         # РЕПАТРИАНТЫ Хайфа/Крайот
]

# Allow runtime override from env var
_env_channels = os.getenv("TELEGRAM_CHANNELS", "").strip()
CHANNELS = (
    [c.strip() for c in _env_channels.split(",") if c.strip()]
    if _env_channels else _DEFAULT_CHANNELS
)

MAX_MESSAGES_PER_CHANNEL = int(os.getenv("TG_MAX_MESSAGES", "200"))
LOOKBACK_HOURS           = int(os.getenv("TG_LOOKBACK_HOURS", "30"))

# Entity-ID cache file: maps username → {id, access_hash}.  Lets us
# build InputPeerChannel directly and skip ResolveUsernameRequest,
# which Telegram throttles to ~250 calls/24h on a user account
# (exceeding it earns a multi-hour FloodWait ban).  Checked into git;
# CI commits new entries back at the end of the scrape step.
ENTITY_CACHE_FILE = os.path.join(os.path.dirname(__file__), "telegram_entity_cache.json")

# ── Supabase helpers ──────────────────────────────────────────────────────────
async def preload_existing_ids(client: httpx.AsyncClient) -> set:
    existing = set()
    offset, limit = 0, 1000
    while True:
        try:
            r = await client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={"select": "source_id", "source": "eq.telegram",
                        "limit": limit, "offset": offset},
            )
            rows = r.json()
            if not isinstance(rows, list) or not rows:
                break
            for row in rows:
                existing.add(row["source_id"])
            if len(rows) < limit:
                break
            offset += limit
        except Exception as e:
            log(f"Preload error: {e}"); break
    log(f"Preloaded {len(existing)} existing Telegram source_ids")
    return existing

def insert_listing(data: dict):
    enrich(data)
    try:
        r = httpx.post(f"{REST_URL}/listings?on_conflict=source_url", headers=SB_HEADERS,
                       content=json.dumps(data, ensure_ascii=False).encode("utf-8"),
                       timeout=10)
        if r.status_code in (200, 201):
            log(f"  + {data.get('city')} | {data.get('price')} | {data.get('rooms')}R")
        elif r.status_code != 409:
            log(f"  ! Insert {r.status_code}: {r.text[:120]}")
    except Exception as e:
        log(f"  ! Insert error: {e}")

# ── Message parser ────────────────────────────────────────────────────────────
# Israeli real-estate Telegram channels post in 3 languages: Hebrew,
# Russian (huge olim/FSU community), and English.  Regexes below cover
# all three so we don't drop listings just because the channel posts in
# Cyrillic.

PHONE_RE  = re.compile(r'(?:\+?972|0)\s*\d[-\s\d]{7,12}')

# Price: Hebrew ₪/שח/NIS + Russian шек/шекелей + Latin shek/shekel/ils
PRICE_RE  = re.compile(
    r'(\d[\d,\.]{2,})\s*'
    r'(?:₪|ש"?ח|שח|NIS|nis|ILS|ils|'
    r'shek(?:el)?s?\.?|'        # Latin transliteration of shekel
    r'шек(?:елей|ел)?\.?|шкл\.?)',  # Cyrillic transliteration
    re.IGNORECASE
)

# Rooms:
#   Hebrew:  3 חדרים / 2.5 חד׳
#   English: 3 rooms / 3 bedrooms
#   Russian: "3-комнатная", "3 комн.", "3-комн", "трёхкомнатная" (digit forms only)
ROOMS_RE  = re.compile(
    r'(\d+(?:[\.,]\d)?)\s*[-\s]?\s*'
    r'(?:חדרים|חדר|חד\.?|חד\'|rooms?|bedrooms?|комнатн(?:ая|ой|ую)|комн\.?|к-?комн\.?)',
    re.IGNORECASE
)

# Size: Hebrew מ"ר / מטר + English m2/sqm + Russian м²/кв.м/кв м
SIZE_RE   = re.compile(
    r'(\d+)\s*(?:מ"?ר|מטר|m2|sqm|м[²2]|кв\.?\s*м)',
    re.IGNORECASE
)

# Floor: Hebrew קומה (always before the number), Russian этаж (can be
# before OR after the number), English floor (before).  Russian also
# accepts the word "первый" (ground/first).
FLOOR_RE  = re.compile(
    r'(?:'
    r'(?:קומה|floor)\s*(?P<a>\d+|קרקע)'
    r'|(?P<b>\d+|первый|перв)\s*[-\s]?\s*этаж'
    r'|этаж[е]?\s*(?P<c>\d+|первый)'
    r')',
    re.IGNORECASE
)

RENT_KEYWORDS = re.compile(
    r'(להשכרה|שכירות|לשכירה|for\s+rent|rental|sublet|sublease|'
    r'сда(?:м|ю|ётся|ется|еться)|аренд[аеуы]|саблет|субаренд[аеу])',
    re.IGNORECASE
)
SALE_KEYWORDS = re.compile(
    r'(למכירה|מכירה|for\s+sale|forsale|'
    r'прода(?:м|ю|ётся|ется|жа|жу))',
    re.IGNORECASE
)

# Major Israeli cities - multi-language alias map.
#   Key  = string to look for in message text (any language)
#   Val  = canonical Hebrew city name used everywhere else in BebKey
# This keeps the city field consistent so front-end city filtering works
# regardless of what language the listing was posted in.
CITY_ALIASES = {
    # Hebrew (canonical - value == key)
    "תל אביב": "תל אביב", "ירושלים": "ירושלים", "חיפה": "חיפה",
    "באר שבע": "באר שבע", "ראשון לציון": "ראשון לציון",
    "פתח תקווה": "פתח תקווה", "נתניה": "נתניה", "חולון": "חולון",
    "בני ברק": "בני ברק", "רמת גן": "רמת גן", "אשדוד": "אשדוד",
    "אשקלון": "אשקלון", "רחובות": "רחובות", "בת ים": "בת ים",
    "כפר סבא": "כפר סבא", "הרצליה": "הרצליה", "מודיעין": "מודיעין",
    "נס ציונה": "נס ציונה", "רמת השרון": "רמת השרון",
    "הוד השרון": "הוד השרון", "רעננה": "רעננה", "ראש העין": "ראש העין",
    "גבעתיים": "גבעתיים", "גבעת שמואל": "גבעת שמואל",
    "אור יהודה": "אור יהודה", "קריית אונו": "קריית אונו", "יהוד": "יהוד",
    "אריאל": "אריאל", "ביתר עילית": "ביתר עילית",
    "מודיעין עילית": "מודיעין עילית", "בית שמש": "בית שמש",
    "מעלה אדומים": "מעלה אדומים", "אפרת": "אפרת", "טבריה": "טבריה",
    "צפת": "צפת", "נצרת": "נצרת", "עפולה": "עפולה",
    "טירת כרמל": "טירת כרמל", "נהריה": "נהריה", "עכו": "עכו",
    "כרמיאל": "כרמיאל", "קריית שמונה": "קריית שמונה", "אילת": "אילת",
    "דימונה": "דימונה", "ערד": "ערד", "שדרות": "שדרות",
    "אופקים": "אופקים", "נתיבות": "נתיבות", "קריית גת": "קריית גת",
    "קריית מלאכי": "קריית מלאכי", "קריית אתא": "קריית אתא",
    "קריית ביאליק": "קריית ביאליק", "קריית מוצקין": "קריית מוצקין",
    "קריית ים": "קריית ים",

    # Russian (Cyrillic) → Hebrew canonical
    "Тель-Авив": "תל אביב",  "Тель Авив": "תל אביב",
    "Иерусалим": "ירושלים",  "Иерусалима": "ירושלים",
    "Хайфа": "חיפה",         "Хайфе": "חיפה",
    "Беэр-Шева": "באר שבע",  "Беер-Шева": "באר שבע", "Беер Шева": "באר שבע",
    "Ришон-ле-Цион": "ראשון לציון", "Ришон ле Цион": "ראשון לציון", "Ришон": "ראשון לציון",
    "Петах-Тиква": "פתח תקווה", "Петах Тиква": "פתח תקווה",
    "Нетания": "נתניה", "Нетании": "נתניה", "Натания": "נתניה",
    "Холон": "חולון",
    "Бней-Брак": "בני ברק", "Бней Брак": "בני ברק",
    "Рамат-Ган": "רמת גן",  "Рамат Ган": "רמת גן",
    "Ашдод": "אשדוד", "Ашдоде": "אשדוד",
    "Ашкелон": "אשקלון", "Ашкелоне": "אשקלון",
    "Реховот": "רחובות", "Реховоте": "רחובות",
    "Бат-Ям": "בת ים", "Бат Ям": "בת ים",
    "Кфар-Саба": "כפר סבא", "Кфар Саба": "כפר סבא",
    "Герцлия": "הרצליה", "Герцлии": "הרצליה",
    "Модиин": "מודיעין",
    "Раанана": "רעננה",
    "Гиватаим": "גבעתיים",
    "Бейт-Шемеш": "בית שמש", "Бейт Шемеш": "בית שמש",
    "Тверия": "טבריה",
    "Цфат": "צפת",
    "Назарет": "נצרת",
    "Афула": "עפולה",
    "Нагария": "נהריה",
    "Акко": "עכו",
    "Кармиэль": "כרמיאל",
    "Эйлат": "אילת", "Эйлате": "אילת",
    "Димона": "דימונה",
    "Арад": "ערד",
    "Сдерот": "שדרות",
    "Ариэль": "אריאל",
    "Маале-Адумим": "מעלה אדומים", "Маале Адумим": "מעלה אדומים",

    # English (Latin) → Hebrew canonical
    "Tel Aviv": "תל אביב", "Tel-Aviv": "תל אביב",
    "Jerusalem": "ירושלים",
    "Haifa": "חיפה",
    "Beer Sheva": "באר שבע", "Beersheva": "באר שבע", "Be'er Sheva": "באר שבע",
    "Rishon LeZion": "ראשון לציון", "Rishon Lezion": "ראשון לציון",
    "Petah Tikva": "פתח תקווה", "Petach Tikva": "פתח תקווה",
    "Netanya": "נתניה",
    "Holon": "חולון",
    "Bnei Brak": "בני ברק",
    "Ramat Gan": "רמת גן",
    "Ashdod": "אשדוד",
    "Ashkelon": "אשקלון",
    "Rehovot": "רחובות",
    "Bat Yam": "בת ים",
    "Kfar Saba": "כפר סבא",
    "Herzliya": "הרצליה", "Herzlia": "הרצליה",
    "Modiin": "מודיעין", "Modi'in": "מודיעין",
    "Raanana": "רעננה", "Ra'anana": "רעננה",
    "Givatayim": "גבעתיים",
    "Beit Shemesh": "בית שמש",
    "Tiberias": "טבריה",
    "Tzfat": "צפת", "Safed": "צפת",
    "Nazareth": "נצרת",
    "Afula": "עפולה",
    "Nahariya": "נהריה",
    "Akko": "עכו", "Acre": "עכו",
    "Karmiel": "כרמיאל",
    "Eilat": "אילת",
    "Dimona": "דימונה",
    "Arad": "ערד",
    "Sderot": "שדרות",
    "Ariel": "אריאל",
    "Maale Adumim": "מעלה אדומים", "Ma'ale Adumim": "מעלה אדומים",
}

# Longer city names must be matched first so "Tel Aviv" matches before
# a hypothetical "Aviv" substring inside another word.
# Case-insensitive lookup table: store (lowercase_key, original_key) so we
# can map "ТЕЛЬ-АВИВ" / "Бат-ям" / "tel aviv" to the canonical Hebrew
# value regardless of how the channel posted it.  Hebrew has no case so
# this is a no-op for Hebrew keys.
_CITY_KEYS_LOWER = sorted(
    ((k.lower(), k) for k in CITY_ALIASES.keys()),
    key=lambda p: len(p[0]),
    reverse=True,
)

def parse_int(text: str | None) -> int | None:
    if not text: return None
    m = re.search(r'(\d[\d,\.]*)', text)
    if not m: return None
    try:
        return int(m.group(1).replace(',', '').replace('.', ''))
    except ValueError:
        return None

def parse_float(text: str | None) -> float | None:
    """Russian uses comma as decimal separator (e.g. '2,5 комнат').
    Hebrew/English use dot.  Normalise both."""
    if not text: return None
    cleaned = text.replace(',', '.')
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None

def strip_phone(text: str) -> str:
    """Remove phone numbers from text before storing (privacy)."""
    return PHONE_RE.sub("[טלפון]", text)

def detect_deal_type(text: str) -> str:
    if RENT_KEYWORDS.search(text):
        return "rent"
    if SALE_KEYWORDS.search(text):
        return "forsale"
    return "forsale"  # default - matches DB convention used by other scrapers

def extract_city(text: str) -> str | None:
    """Find the first city mentioned in any supported language and
    return its canonical Hebrew name.  Case-insensitive (important for
    Russian sublet posts that use ALL-CAPS city names like 'ТЕЛЬ-АВИВ',
    or casual lowercase like 'Бат-ям').  Sorted longest-first to avoid
    partial-substring collisions (e.g. 'Tel Aviv' before 'Aviv')."""
    text_lower = text.lower()
    for key_lower, key in _CITY_KEYS_LOWER:
        if key_lower in text_lower:
            return CITY_ALIASES[key]
    return None

def parse_message(msg, channel_username: str) -> dict | None:
    """Convert a Telethon message → listing dict.  None if it isn't a listing."""
    text = msg.message or ""
    if len(text) < 30:
        return None

    # Must look like a real-estate post: contains price OR rooms OR deal keyword
    has_price = bool(PRICE_RE.search(text))
    has_rooms = bool(ROOMS_RE.search(text))
    has_deal  = bool(RENT_KEYWORDS.search(text) or SALE_KEYWORDS.search(text))
    if not (has_price or has_rooms or has_deal):
        return None

    msg_url = f"https://t.me/{channel_username.lstrip('@')}/{msg.id}"

    # Price
    price = None
    pm = PRICE_RE.search(text)
    if pm:
        price = parse_int(pm.group(0))
        if price and price < 200:
            price = None  # weed out non-prices

    # Rooms - handle Russian comma-decimal (2,5 комнат)
    rooms = None
    rm = ROOMS_RE.search(text)
    if rm:
        rooms = parse_float(rm.group(1))

    # Size
    size_m2 = None
    sm = SIZE_RE.search(text)
    if sm:
        size_m2 = parse_float(sm.group(1))

    # Floor - Hebrew קרקע (ground) and Russian "первый" (first/ground).
    # The regex has 3 alternatives via named groups; pick whichever matched.
    floor = None
    fm = FLOOR_RE.search(text)
    if fm:
        floor_raw = fm.group("a") or fm.group("b") or fm.group("c") or ""
        if "קרקע" in floor_raw or "перв" in floor_raw.lower():
            floor = 0
        else:
            try:
                floor = int(floor_raw)
            except ValueError:
                floor = None

    deal_type = detect_deal_type(text)
    city      = extract_city(text)

    # Title = first ~60 chars of cleaned text, single-line
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    title      = (first_line[:200] or text[:200]).strip()

    return {
        "source":      "telegram",
        "source_id":   f"{channel_username.lstrip('@')}_{msg.id}",
        "source_url":  msg_url,
        "title":       title,
        "description": strip_phone(text[:2000]),
        "price":       price,
        "rooms":       rooms,
        "size_m2":     size_m2,
        "floor":       floor,
        "city":        city,
        "deal_type":   deal_type,
        "images":      [],  # photos handled separately if media downloaded
        "is_active":   True,
        "scraped_at":  datetime.now(timezone.utc).isoformat(),
    }

# ── Entity cache ──────────────────────────────────────────────────────────────
def load_entity_cache() -> dict:
    """Load {username_lower: {'id': int, 'access_hash': int}} from disk."""
    if not os.path.exists(ENTITY_CACHE_FILE):
        return {}
    try:
        with open(ENTITY_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"  ! Couldn't read entity cache: {e}")
        return {}

def save_entity_cache(cache: dict):
    try:
        with open(ENTITY_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True)
    except Exception as e:
        log(f"  ! Couldn't write entity cache: {e}")


# Sentinel raised by scrape_channel when Telegram returns FloodWait on
# username resolution.  The main loop catches it and bails out of the
# whole scan - making 90 more failing requests just keeps the ban hot.
class TelegramFloodWait(Exception):
    pass


# ── Main ──────────────────────────────────────────────────────────────────────
async def scrape_channel(client_tg, sb_client: httpx.AsyncClient,
                         channel: str, existing: set,
                         entity_cache: dict) -> int:
    # Lazy-import the Telethon bits we need (the module-level import is
    # also lazy so this file is import-safe for the probe script).
    from telethon.tl.types import InputPeerChannel
    from telethon.errors import (
        FloodWaitError, UsernameNotOccupiedError, UsernameInvalidError,
    )

    cutoff = datetime.now(timezone.utc).timestamp() - LOOKBACK_HOURS * 3600
    saved  = 0
    handle = channel.lstrip("@").lower()

    # ── 1. Resolve channel entity ──
    # Prefer the cached (id, access_hash) so we never invoke
    # ResolveUsernameRequest (heavily throttled, see ENTITY_CACHE_FILE).
    entity = None
    cached = entity_cache.get(handle)
    if cached:
        try:
            entity = InputPeerChannel(cached["id"], cached["access_hash"])
        except Exception as e:
            log(f"  ! Cache hit for {channel} but build failed: {e}")
            entity = None

    if entity is None:
        try:
            entity = await client_tg.get_entity(channel)
            # Save resolved ID for next time - these don't change.
            cid = getattr(entity, "id", None)
            ah  = getattr(entity, "access_hash", None)
            if cid and ah is not None:
                entity_cache[handle] = {"id": cid, "access_hash": ah}
        except FloodWaitError as e:
            log(f"  ✗ FLOOD_WAIT on {channel}: {e.seconds}s (~{e.seconds//3600}h). "
                f"Bailing out - further resolutions only keep the ban hot.")
            raise TelegramFloodWait(e.seconds) from e
        except (UsernameNotOccupiedError, UsernameInvalidError) as e:
            log(f"  · skip {channel} (no such username)")
            return 0
        except Exception as e:
            err_msg = str(e)[:80]
            # Some FloodWait variants come through as plain Exception
            if "wait of" in err_msg.lower() and "second" in err_msg.lower():
                log(f"  ✗ FLOOD_WAIT on {channel}: {err_msg}. Bailing out.")
                raise TelegramFloodWait(0) from e
            log(f"  · skip {channel} ({err_msg})")
            return 0

    channel_username = getattr(entity, "username", None) or channel.lstrip("@")
    log(f"  ▶ {channel_username}: scanning up to {MAX_MESSAGES_PER_CHANNEL} messages "
        f"(last {LOOKBACK_HOURS}h)")

    # ── 2. Scan messages ──
    count_scanned = 0
    try:
        async for msg in client_tg.iter_messages(entity, limit=MAX_MESSAGES_PER_CHANNEL):
            count_scanned += 1
            if msg.date.timestamp() < cutoff:
                break

            row = parse_message(msg, channel_username)
            if not row:
                continue
            if row["source_id"] in existing:
                continue

            insert_listing(row)
            existing.add(row["source_id"])
            saved += 1
    except FloodWaitError as e:
        log(f"  ✗ FLOOD_WAIT during iter on {channel}: {e.seconds}s. Bailing out.")
        raise TelegramFloodWait(e.seconds) from e

    log(f"  ✓ {channel_username}: {saved} new listings from {count_scanned} messages")
    return saved

async def main():
    log("=" * 60)
    log("BebKey Telegram Real-Estate Scraper starting")
    log(f"Channels: {len(CHANNELS)} | Lookback: {LOOKBACK_HOURS}h | "
        f"Max msgs/channel: {MAX_MESSAGES_PER_CHANNEL}")
    log("=" * 60)

    # Validate environment (deferred from module level so this file is
    # importable from scripts/tg_probe_channels.py)
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("ERROR: Missing Supabase env vars"); sys.exit(1)
    if not TG_API_ID or not TG_API_HASH or not TG_SESSION:
        log("Telegram credentials not set - skipping (set TELEGRAM_API_ID, "
            "TELEGRAM_API_HASH, TELEGRAM_SESSION as GitHub Secrets to enable)")
        return

    # Lazy-import telethon so callers that only want the channel list
    # (e.g. scripts/tg_probe_channels.py) can import this module without
    # having telethon installed.
    try:
        from telethon import TelegramClient  # noqa: F811
        from telethon.sessions import StringSession  # noqa: F811
    except ImportError:
        log("ERROR: telethon not installed.  Add 'telethon' to scrapers/requirements.txt")
        sys.exit(1)

    try:
        api_id = int(TG_API_ID)
    except ValueError:
        log("ERROR: TELEGRAM_API_ID must be an integer"); return

    async with httpx.AsyncClient(timeout=30) as sb_client:
        existing = await preload_existing_ids(sb_client)

        client = TelegramClient(StringSession(TG_SESSION), api_id, TG_API_HASH)
        await client.connect()
        if not await client.is_user_authorized():
            log("ERROR: TELEGRAM_SESSION is not authorized.  Regenerate it locally.")
            await client.disconnect()
            return

        # Load the entity cache once; pass by reference to each call.
        entity_cache = load_entity_cache()
        log(f"Loaded entity cache: {len(entity_cache)} entries "
            f"(of {len(CHANNELS)} channels)")
        cache_before = len(entity_cache)

        total_saved = 0
        flood_bail = False
        for channel in CHANNELS:
            try:
                saved = await scrape_channel(client, sb_client, channel,
                                             existing, entity_cache)
                total_saved += saved
            except TelegramFloodWait:
                # Telegram has flagged this account.  Stop trying - every
                # further ResolveUsernameRequest just confirms the abuse
                # signal.  The wait expires naturally in hours.
                flood_bail = True
                break
            except Exception as e:
                log(f"  ✗ Exception in {channel}: {e}")
            # Be polite: 0.5s baseline.  Telegram rate limits are global
            # per-account, so a tighter sleep here is fine.
            await asyncio.sleep(0.5)

        # Persist any newly-resolved entity IDs so future runs skip
        # ResolveUsernameRequest entirely.
        if len(entity_cache) > cache_before:
            save_entity_cache(entity_cache)
            log(f"Entity cache: added {len(entity_cache) - cache_before} entries, "
                f"total {len(entity_cache)}")

        await client.disconnect()

    log("=" * 60)
    if flood_bail:
        log(f"FLOOD-WAIT BAIL - saved {total_saved} listings before bail.")
        log("Next run after the wait expires will resume using the entity cache.")
    else:
        log(f"DONE - {total_saved} new Telegram listings saved")
    log("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
