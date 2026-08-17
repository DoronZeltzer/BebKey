"""
Normalize English / transliterated Israeli city names → canonical Hebrew DB names.
Built from src/lib/cityNames.ts - mirrors the same mapping in reverse (en → he).
Used by OnMap and Janglo scrapers (English pages) to store consistent Hebrew names.

Also handles:
  - Compound English names with area suffixes, e.g. "Givatayim, North Zone" → גבעתיים
  - Hebrew city names with region qualifiers, e.g. "ירושלים - מרכז" → ירושלים
  - Common Yad2 area suffixes like "מרכז", "דרום", "צפון" appended to city names
"""

_EN_TO_HE: dict[str, str] = {
    # Major cities
    "Tel Aviv-Yafo": "תל אביב יפו",
    "Tel Aviv Yafo": "תל אביב יפו",
    "Tel Aviv": "תל אביב יפו",
    "Jerusalem": "ירושלים",
    "Haifa": "חיפה",
    "Rishon LeZion": "ראשון לציון",
    "Rishon LeTsiyon": "ראשון לציון",
    "Rishon Lezion": "ראשון לציון",
    "Petah Tikva": "פתח תקווה",
    "Petah Tiqwa": "פתח תקווה",
    "Ashdod": "אשדוד",
    "Netanya": "נתניה",
    "Be'er Sheva": "באר שבע",
    "Beer Sheva": "באר שבע",
    "Beersheba": "באר שבע",
    "Bnei Brak": "בני ברק",
    "Holon": "חולון",
    "Ramat Gan": "רמת גן",
    "Ashkelon": "אשקלון",
    "Rehovot": "רחובות",
    "Bat Yam": "בת ים",
    "Herzliya": "הרצליה",
    "Kfar Saba": "כפר סבא",
    "Modi'in": "מודיעין מכבים רעות",
    "Modiin": "מודיעין מכבים רעות",
    "Ra'anana": "רעננה",
    "Raanana": "רעננה",
    "Lod": "לוד",
    "Ramla": "רמלה",
    "Nes Ziona": "נס ציונה",
    "Yavne": "יבנה",
    "Givatayim": "גבעתיים",
    "Giv'atayim": "גבעתיים",
    "Hod HaSharon": "הוד השרון",
    "Givat Shmuel": "גבעת שמואל",
    "Kiryat Gat": "קריית גת",
    "Acre": "עכו",
    "Akko": "עכו",
    "Nahariya": "נהריה",
    "Karmiel": "כרמיאל",
    "Eilat": "אילת",
    "Ariel": "אריאל",
    "Beit Shemesh": "בית שמש",
    "Ma'ale Adumim": "מעלה אדומים",
    "Or Yehuda": "אור יהודה",
    "Be'er Ya'akov": "באר יעקב",
    "Beer Yaakov": "באר יעקב",
    "Ofakim": "אופקים",
    "Harish": "חריש",
    "Afula": "עפולה",
    "Nazareth": "נצרת",
    "Nof HaGalil": "נוף הגליל",
    "Dimona": "דימונה",
    "Arad": "ערד",
    "Mitzpe Ramon": "מצפה רמון",
    "Netivot": "נתיבות",
    "Sderot": "שדרות",
    "Rahat": "רהט",
    "Umm al-Fahm": "אום אל-פחם",
    # Gush Dan / Sharon
    "Ramat HaSharon": "רמת השרון",
    "Ganei Tikva": "גני תקווה",
    "Savyon": "סביון",
    "Kfar Yona": "כפר יונה",
    "Kfar Yonah": "כפר יונה",
    "Kadima-Zoran": "קדימה-צורן",
    "El'ad": "אלעד",
    "Elad": "אלעד",
    "Rosh HaAyin": "ראש העין",
    "Rosh Haayin": "ראש העין",
    "Yehud": "יהוד",
    "Nesher": "נשר",
    "Kiryat Ono": "קריית אונו",
    "Kiryat Bialik": "קריית ביאליק",
    "Kiryat Yam": "קריית ים",
    "Kiryat Motzkin": "קריית מוצקין",
    "Kiryat Ata": "קריית אתא",
    "Gadera": "גדרה",
    "Shoham": "שוהם",
    "Beit Dagan": "בית דגן",
    "Binyamina": "בנימינה",
    "Binyamina Giv'at Ada": "בנימינה-גבעת עדה",
    "Pardesiya": "פרדסיה",
    "Or Akiva": "אור עקיבא",
    "Even Yehuda": "אבן יהודה",
    "Tel Mond": "תל מונד",
    "Kfar Shmaryahu": "כפר שמריהו",
    "Mazkeret Batya": "מזכרת בתיה",
    # Jerusalem area
    "Mevaseret Zion": "מבשרת ציון",
    "Givat Ze'ev": "גבעת זאב",
    "Ma'alot-Tarshiha": "מעלות-תרשיחא",
    "Kiryat Arba": "קריית ארבע",
    "Efrat": "אפרת",
    "Beitar Illit": "ביתר עילית",
    "Modi'in Illit": "מודיעין עילית",
    # North
    "Tiberias": "טבריה",
    "Safed": "צפת",
    "Kiryat Shmona": "קריית שמונה",
    "Migdal HaEmek": "מגדל העמק",
    "Mghar": "מגאר",
    "Shfaram": "שפרעם",
    "Sakhnin": "סח'נין",
    "Tamra": "טמרה",
    "Iksal": "אכסאל",
    # Extra Yad2 / Janglo transliteration variants
    "Kiryat Malakhi": "קריית מלאכי",
    "Kiryat Gat": "קריית גת",
    "Hadera": "חדרה",
    "Zichron Yaakov": "זכרון יעקב",
    "Zichron Ya'akov": "זכרון יעקב",
    "Caesarea": "קיסריה",
    "Yokneam": "יוקנעם עילית",
    "Yoqneam": "יוקנעם עילית",
    "Nesher": "נשר",
    "Tirat Carmel": "טירת כרמל",
    "Tirat Hacarmel": "טירת כרמל",
    "Bet Shean": "בית שאן",
    "Beit She'an": "בית שאן",
    "Hatzor Haglilit": "חצור הגלילית",
    "Pardes Hanna": "פרדס חנה כרכור",
    "Pardess Hanna": "פרדס חנה כרכור",
    "Umm al-Fahm": "אום אל-פחם",
    "Umm al Fahm": "אום אל-פחם",
    "Baka al-Gharbiyye": "באקה אל-גרבייה",
    "Baqa al-Gharbiyya": "באקה אל-גרבייה",
    "Tayibe": "טייבה",
    "Taibe": "טייבה",
    "Tira": "טירה",
    "Arra": "ערערה",
    "Ara": "ערערה",
    "Mghar": "מגאר",
    "Majd al-Krum": "מג'ד אל-כרום",
    "Kafr Kanna": "כפר כנא",
    "Kfar Kanna": "כפר כנא",
    "Majd el Krum": "מג'ד אל-כרום",
    "Shlomi": "שלומי",
    "Omer": "עומר",
    "Yeruham": "ירוחם",
    "Yeroham": "ירוחם",
    "Ashdod": "אשדוד",
    "Shoham": "שוהם",
}

# Lowercase lookup for case-insensitive matching
_EN_TO_HE_LOWER: dict[str, str] = {k.lower(): v for k, v in _EN_TO_HE.items()}

# Hebrew area-qualifier suffixes that Yad2 sometimes appends to city names
# e.g. "תל אביב יפו - צפון" → "תל אביב יפו"
_HE_STRIP_SUFFIXES = (
    " - מרכז", " - צפון", " - דרום", " - מזרח", " - מערב",
    " - שכונה", " מרכז", " צפון", " דרום",
    " (מרכז)", " (צפון)", " (דרום)", " (מזרח)", " (מערב)",
)


def _strip_he_qualifiers(city: str) -> str:
    """Remove common Hebrew area-qualifier suffixes from a city name."""
    for suffix in _HE_STRIP_SUFFIXES:
        if city.endswith(suffix):
            return city[: -len(suffix)].strip()
    # Also handle " - anything" pattern generically
    if " - " in city:
        return city.split(" - ")[0].strip()
    return city


def normalize_city(city: str | None) -> str | None:
    """
    Return the canonical Hebrew city name for a given English/transliterated
    or Hebrew name. Returns the original (stripped) string if no match is found.

    Handles:
      - English exact / case-insensitive match
      - English compound names with comma-separated area, e.g. "Givatayim, North" →
        tries the first segment as the city name
      - Hebrew names with area qualifiers, e.g. "ירושלים - מרכז" → ירושלים
    """
    if not city:
        return city

    city_stripped = city.strip()

    # ── Already Hebrew? Clean qualifiers and return ───────────────────────────
    if any('א' <= c <= 'ת' for c in city_stripped):
        return _strip_he_qualifiers(city_stripped)

    # ── English exact match ───────────────────────────────────────────────────
    if city_stripped in _EN_TO_HE:
        return _EN_TO_HE[city_stripped]

    # ── Case-insensitive exact match ──────────────────────────────────────────
    lower = city_stripped.lower()
    if lower in _EN_TO_HE_LOWER:
        return _EN_TO_HE_LOWER[lower]

    # ── Compound "City, Area" - try the first segment ─────────────────────────
    if "," in city_stripped:
        first = city_stripped.split(",")[0].strip()
        if first in _EN_TO_HE:
            return _EN_TO_HE[first]
        if first.lower() in _EN_TO_HE_LOWER:
            return _EN_TO_HE_LOWER[first.lower()]

    # ── Prefix match - handles e.g. "Tel Aviv Port" → "תל אביב יפו" ──────────
    for en_key, he_val in _EN_TO_HE.items():
        if lower.startswith(en_key.lower() + " ") or lower.startswith(en_key.lower() + ","):
            return he_val

    # Unknown - return as-is so it's at least visible in the DB
    return city_stripped
