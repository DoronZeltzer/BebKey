/**
 * Vercel serverless function: POST /api/ai-search
 *
 * Takes a free-text query in any language (he/en/ru/ar/fr) and uses
 * Claude Haiku to parse it into BebKey's structured search filters.
 *
 * This is BebKey's counter to keyz.ai's flagship "natural language
 * search" feature.  Our edge: 19.5K+ aggregated listings vs their
 * tiny direct-marketplace inventory.
 *
 * Example queries it handles:
 *   "3-bedroom apartment in Tel Aviv near the beach under 8000 shekel"
 *   "דירת 4 חדרים בנתניה עד מיליון וחצי"
 *   "квартира 3 комнаты в Иерусалиме до 7000 шекелей"
 *
 * Env vars:
 *   ANTHROPIC_API_KEY   - required, server-only
 *
 * Response:
 *   { filters: { city, dealType, priceMin, priceMax, rooms, ... },
 *     understood: "human-readable summary of what we parsed",
 *     queryUrl: "/search?city=...&dealType=...&..." }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

// Canonical Hebrew city names - these match the EXACT spelling stored in the
// listings.city column (Search.tsx does an exact `.eq('city', ...)` match, so
// any mismatch returns ZERO results).  These were reconciled against the live
// DB after the city-canonicalization backfill, which merged variant spellings
// (תל אביב → תל אביב יפו, מודיעין → מודיעין מכבים רעות, קריית X → קרית X).
// snapCity() below is the runtime safety-net for any spelling that still drifts.
const CANONICAL_CITIES = [
  'תל אביב יפו', 'ירושלים', 'חיפה', 'באר שבע', 'ראשון לציון',
  'פתח תקווה', 'נתניה', 'חולון', 'בני ברק', 'רמת גן',
  'אשדוד', 'אשקלון', 'רחובות', 'בת ים', 'כפר סבא',
  'הרצליה', 'מודיעין מכבים רעות', 'נס ציונה', 'רמת השרון', 'הוד השרון',
  'רעננה', 'ראש העין', 'גבעתיים', 'גבעת שמואל', 'אור יהודה',
  'קרית אונו', 'יהוד', 'אריאל', 'ביתר עילית', 'מודיעין עילית',
  'בית שמש', 'מעלה אדומים', 'אפרת', 'טבריה', 'צפת',
  'נצרת', 'עפולה', 'טירת כרמל', 'נהריה', 'עכו',
  'כרמיאל', 'קרית שמונה', 'אילת', 'דימונה', 'ערד',
  'שדרות', 'אופקים', 'נתיבות', 'קרית גת', 'קרית מלאכי',
  'קרית אתא', 'קרית ביאליק', 'קרית מוצקין', 'נשר', 'יבנה',
  'רמלה', 'לוד', 'קיסריה', 'זכרון יעקב', 'כפר שמריהו',
] as const

// ── City spelling safety-net ────────────────────────────────────────────────
// The DB stores ONE canonical spelling per city (post-backfill).  The model
// occasionally emits a stale/variant spelling; these would exact-match nothing.
// snapCity() snaps any output to a real DB value via: exact match → alias map →
// קריית/קרית-normalised match → "starts-with" containment.  Authoritative
// aliases (ambiguous cases the normaliser can't resolve) live here.
const CITY_ALIASES: Record<string, string> = {
  'תל אביב': 'תל אביב יפו', 'תל אביב-יפו': 'תל אביב יפו', 'תל אביב יפו': 'תל אביב יפו',
  'מודיעין': 'מודיעין מכבים רעות', 'מודיעין-מכבים-רעות': 'מודיעין מכבים רעות',
  'מודיעין מכבים רעות': 'מודיעין מכבים רעות',
  'קריית אונו': 'קרית אונו', 'קריית אתא': 'קרית אתא', 'קריית גת': 'קרית גת',
  'קריית מלאכי': 'קרית מלאכי', 'קריית שמונה': 'קרית שמונה', 'קריית ביאליק': 'קרית ביאליק',
  'קריית מוצקין': 'קרית מוצקין', 'קריית ים': 'קרית ים', 'קריית עקרון': 'קרית עקרון',
  'קריית טבעון': 'קרית טבעון',
  'נצרת עילית': 'נצרת עילית / נוף הגליל', 'נוף הגליל': 'נצרת עילית / נוף הגליל',
}

/** Normalise a city for fuzzy matching: drop quotes/hyphens, fold קריית→קרית. */
function normCity(s: string): string {
  return s
    .replace(/["'’‘״׳`]/g, '')
    .replace(/[-־–]/g, ' ')
    .replace(/קריית/g, 'קרית')
    .replace(/\s+/g, ' ')
    .trim()
}

// Cached at module scope so warm serverless invocations reuse it.
let _dbCities: string[] | null = null
let _dbCityNorm: Map<string, string> | null = null

async function loadCities(): Promise<void> {
  if (_dbCities || !SUPABASE_URL || !SUPABASE_KEY) return
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_distinct_cities`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!r.ok) return
    const arr = (await r.json()) as unknown[]
    const names = arr.filter((x): x is string => typeof x === 'string')
    if (!names.length) return
    _dbCities = names
    _dbCityNorm = new Map()
    for (const n of names) {
      const k = normCity(n)
      if (!_dbCityNorm.has(k)) _dbCityNorm.set(k, n)
    }
  } catch {
    // Leave caches null → snapCity falls back to the static alias map.
  }
}

/** Snap a model-emitted city to a real listings.city value (or pass through). */
function snapCity(city: string | null): string | null {
  if (!city) return null
  const c = city.trim()
  if (!c) return null
  if (_dbCities && _dbCities.includes(c)) return c                 // already exact
  const alias = CITY_ALIASES[c]
  if (alias && (!_dbCities || _dbCities.includes(alias))) return alias
  if (_dbCityNorm) {
    const k = normCity(c)
    const exactNorm = _dbCityNorm.get(k)
    if (exactNorm) return exactNorm                                // e.g. קריית→קרית
    // containment: a DB city that begins with the query (תל אביב → תל אביב יפו)
    for (const n of _dbCities ?? []) {
      if (normCity(n).startsWith(k + ' ')) return n
    }
  }
  return alias ?? c
}

const SYSTEM_PROMPT = `You are a query parser for BebKey, an Israeli real estate aggregator. Convert a user's free-text apartment search query (in Hebrew/English/Russian/Arabic/French/Yiddish) into a STRICT JSON object matching BebKey's filter schema.

═══════════════════════════════════════════════════════════════
OUTPUT SCHEMA (return JSON ONLY - no markdown fences, no commentary)
═══════════════════════════════════════════════════════════════
{
  "city": string | null,          // canonical Hebrew city name from the list below, or null
  "neighborhood": string | null,  // neighborhood/area name (free text), or null
  "dealType": "rent" | "forsale" | null,
  "priceMin": number | null,      // shekels
  "priceMax": number | null,      // shekels
  "rooms": number[] | null,       // e.g. [3] or [3, 3.5, 4] for "3-4 rooms"
  "sizeMin": number | null,       // square meters
  "sizeMax": number | null,       // square meters
  "propertyType": string | null,  // see PROPERTY TYPES below
  "features": {                   // ONLY include features the user mentioned positively
    "parking"?: true,             // חניה / парковка / parking
    "elevator"?: true,            // מעלית / лифт / ascenseur
    "balcony"?: true,             // מרפסת / балкон / balcon
    "mamad"?: true,               // ממ"ד / safe room / бомбоубежище
    "furnished"?: true,           // מרוהט / с мебелью / meublé
    "air_conditioning"?: true,    // מזגן / кондиционер / climatisation
    "storage_room"?: true,        // מחסן / кладовка / cave
    "accessible"?: true           // נגיש / accessible / для инвалидов
  } | null,
  "keyword": string | null,       // free-text qualifier for substring search in listing description (lifestyle, "near X", religious community, etc.) - ALWAYS in Hebrew if possible
  "understood": string            // ONE short Hebrew sentence summarising what was parsed
}

═══════════════════════════════════════════════════════════════
CANONICAL CITIES (return EXACTLY one of these - map every spelling/language to it)
═══════════════════════════════════════════════════════════════
${CANONICAL_CITIES.join(', ')}

⚠️ EXACT DB SPELLINGS — the search does an exact city match, so these MUST be precise:
• Output "תל אביב יפו" (NEVER "תל אביב").
• Output "מודיעין מכבים רעות" for the city of Modi'in (NEVER "מודיעין"). "מודיעין עילית" is a DIFFERENT city — keep it as-is.
• Spell every Kiryat city with "קרית" NOT "קריית": קרית אונו, קרית גת, קרית אתא, קרית ביאליק, קרית מוצקין, קרית שמונה, קרית מלאכי, קרית ים, קרית עקרון, קרית טבעון.
• For Nazareth Illit / Nof HaGalil output "נצרת עילית / נוף הגליל" (the Arab city of Nazareth is just "נצרת").
You are NOT limited to the cities listed above — if the user names a SPECIFIC Israeli city, town, moshav or kibbutz that isn't listed (e.g. קיסריה, כפר שמריהו, זכרון יעקב, פרדס חנה כרכור, גן יבנה, אבן יהודה), return its standard Hebrew name DIRECTLY. Only map to a region anchor city when the user names a REGION/area, never for a specific locality.

Common transliterations: "Tel Aviv"/"Тель-Авив"/"Yafo"/"تل أبيب" → "תל אביב יפו"; "Yerushalayim"/"Иерусалим"/"Al-Quds"/"القدس" → "ירושלים"; "Haifa"/"Хайфа"/"Haïfa" → "חיפה"; "Netanya"/"Нетания"/"Натания" → "נתניה"; "Beersheba"/"Be'er Sheva"/"Беэр-Шева" → "באר שבע"; "Petach Tikva"/"Petah Tikvah" → "פתח תקווה"; "Bnei Brak"/"Bene Beraq" → "בני ברק"; "Rishon LeZion"/"Rishon" → "ראשון לציון"; "Modi'in"/"Modiin" → "מודיעין מכבים רעות"; "Bet Shemesh"/"Beit Shemesh"/"RBS" → "בית שמש"; "Karmiel"/"Кармиэль" → "כרמיאל"; "Akko"/"Acre"/"عكا" → "עכו"; "Tzfat"/"Safed" → "צפת"; "Caesarea"/"Кейсария"/"قيسارية" → "קיסריה".

═══════════════════════════════════════════════════════════════
REGIONS - map to an anchor city + explain in "understood"
═══════════════════════════════════════════════════════════════
- "center" / "merkaz" / "מרכז" / "מרכז הארץ" / "Gush Dan" / "גוש דן" / "центр" / "centre du pays" / "وسط البلاد"
   → city = "תל אביב"
   → understood note: "(מרכז הארץ - כולל גם רמת גן, גבעתיים, פתח תקווה, חולון, רמת השרון ועוד)"

- "north" / "tzafon" / "צפון" / "Galilee" / "Galil" / "галилея" / "север" / "nord"
   → city = "חיפה"
   → note: "(צפון - כולל גם כרמיאל, נהריה, עכו, נצרת, צפת, טבריה ועוד)"

- "south" / "darom" / "דרום" / "Negev" / "Негев" / "юг" / "sud"
   → city = "באר שבע"
   → note: "(דרום - כולל גם אשקלון, אשדוד, אילת, דימונה, ערד, שדרות ועוד)"

- "Sharon" / "השרון" / "Шарон"
   → city = "הרצליה"
   → note: "(השרון - כולל גם רעננה, כפר סבא, נתניה, הוד השרון ועוד)"

- "Jerusalem area" / "אזור ירושלים" / "Judean Hills" / "הרי יהודה"
   → city = "ירושלים"
   → note: "(אזור ירושלים - כולל גם מודיעין, בית שמש, מעלה אדומים, אפרת)"

- "Krayot" / "הקריות" / "Крайот"
   → city = "קריית אתא"
   → note: "(הקריות - כוללות גם קריית ביאליק, מוצקין, ים)"

- "Shfela" / "השפלה" / "lowlands" / "Шфела"
   → city = "רחובות"
   → note: "(שפלה - כולל גם רחובות, נס ציונה, יבנה, רמלה ועוד)"

- "Golan" / "רמת הגולן" / "Golan Heights"
   → city = "קצרין" - but our list has no Katzrin so use "קריית שמונה" + note
   → if user wants Golan and we have no city: city = null, neighborhood = "רמת הגולן", and keyword = "גולן"

- "Yehuda v'Shomron" / "Judea and Samaria" / "West Bank settlements"
   → city = "אריאל"
   → note: "(יהודה ושומרון - כולל גם אפרת, מעלה אדומים, ביתר עילית ועוד)"

═════════════════════════════════════════════════════════════
SUB-REGIONS — match these BEFORE the top-level fall-through.
Every entry lists synonyms in HE / EN / RU / AR / FR where
they're commonly used.  Match ANY of them.
═════════════════════════════════════════════════════════════

────── NORTH sub-regions ──────
- HE: גליל מערבי | EN: Western Galilee, Galil Maaravi, Galil Ma'aravi
  RU: Западная Галилея | AR: الجليل الغربي | FR: Galilée occidentale
  → city = "נהריה"
  → note: "(גליל מערבי - כולל גם עכו, מעלות-תרשיחא, שלומי, נהריה ועוד)"

- HE: גליל עליון | EN: Upper Galilee, Galil Elyon
  RU: Верхняя Галилея | AR: الجليل الأعلى | FR: Haute-Galilée
  → city = "קריית שמונה"
  → note: "(גליל עליון - כולל גם צפת, ראש פינה, חצור ועוד)"

- HE: גליל תחתון | EN: Lower Galilee, Galil Tahton
  RU: Нижняя Галилея | AR: الجليل الأسفل | FR: Basse-Galilée
  → city = "טבריה"
  → note: "(גליל תחתון - כולל גם נצרת, מגדל העמק, יבניאל ועוד)"

- HE: גליל מזרחי | EN: Eastern Galilee, Galil Mizrachi
  RU: Восточная Галилея | AR: الجليل الشرقي | FR: Galilée orientale
  → city = "טבריה"

- HE: גליל המרכז, מסגב | EN: Central Galilee, Misgav | RU: Центральная Галилея
  → city = "כרמיאל"
  → note: "(גליל המרכז - כולל גם סח'נין, עראבה, נחף ועוד)"

- HE: עמק יזרעאל | EN: Jezreel Valley, Emek Yizrael
  RU: Изреэльская долина | AR: مرج ابن عامر | FR: Vallée de Jezréel
  → city = "עפולה"
  → note: "(עמק יזרעאל - כולל גם מגדל העמק, נצרת עילית ועוד)"

- HE: עמק חפר | EN: Hefer Valley, Emek Hefer
  RU: Долина Хефер | FR: Vallée de Hefer
  → city = "נתניה"
  → note: "(עמק חפר - אזור נתניה, אבן יהודה, פרדסיה)"

- HE: עמק הירדן, בקעת הירדן | EN: Jordan Valley, Emek HaYarden
  RU: Иорданская долина | AR: غور الأردن | FR: Vallée du Jourdain
  → city = "טבריה"
  → note: "(עמק הירדן - אזור טבריה, בית שאן)"

- HE: עמק בית שאן | EN: Beit She'an Valley
  → city = "טבריה"

- HE: עמק זבולון | EN: Zevulun Valley | AR: مرج زبولون
  → city = "חיפה"
  → note: "(עמק זבולון - אזור הקריות מסביב לחיפה)"

- HE: עמק האלה | EN: Elah Valley | AR: وادي البطمة
  → city = "בית שמש"

- HE: הכרמל, הר הכרמל | EN: Mount Carmel, Carmel
  RU: Гора Кармель | AR: جبل الكرمل | FR: Mont Carmel
  → city = "חיפה"
  → note: "(הר הכרמל - שכונות יוקרתיות של חיפה)"

- HE: חוף הכרמל | EN: Carmel Coast | AR: ساحل الكرمل
  → city = "חיפה"
  → note: "(חוף הכרמל - אטלית, זיכרון יעקב ועוד)"

- HE: עמק הבכא, עמק החולה | EN: Hula Valley, Hula
  RU: Долина Хула | AR: سهل الحولة
  → city = "קריית שמונה"

- HE: מבואות החרמון, רמת הגולן הצפונית | EN: Hermon foothills
  → city = "קריית שמונה"

- HE: מטה אשר | EN: Matte Asher
  → city = "נהריה"
  → note: "(מטה אשר - מועצה אזורית בגליל המערבי)"

────── CENTER sub-regions ──────
- HE: שרון צפוני | EN: Northern Sharon | RU: Северный Шарон
  → city = "נתניה"

- HE: שרון דרומי | EN: Southern Sharon | RU: Южный Шарон
  → city = "רעננה"

- HE: גוש דן | EN: Gush Dan, Tel Aviv Metro, Greater Tel Aviv
  RU: Гуш-Дан | AR: غوش دان | FR: Région de Tel Aviv
  → city = "תל אביב"
  → note: "(גוש דן - כולל גם רמת גן, גבעתיים, פתח תקווה, חולון, בני ברק)"

- HE: בקעת אונו | EN: Ono Valley
  → city = "קריית אונו"

- HE: בקעת לוד, חבל לוד | EN: Lod Plain, Lod area
  → city = "ראשון לציון"
  → note: "(בקעת לוד - לוד, רמלה ועוד)"

- HE: מישור החוף | EN: Coastal Plain | RU: Прибрежная равнина | FR: Plaine côtière
  → city = "תל אביב"
  → note: "(מישור החוף - כל הערים הסמוכות לים התיכון)"

- HE: עמק איילון | EN: Ayalon Valley
  → city = "מודיעין"

────── SOUTH sub-regions ──────
- HE: נגב מערבי | EN: Western Negev | RU: Западный Негев
  AR: النقب الغربي | FR: Néguev occidental
  → city = "שדרות"
  → note: "(נגב מערבי - שדרות, אופקים, נתיבות ועוד)"

- HE: נגב צפוני | EN: Northern Negev | RU: Северный Негев
  AR: النقب الشمالي
  → city = "באר שבע"

- HE: נגב דרומי | EN: Southern Negev | RU: Южный Негев
  AR: النقب الجنوبي
  → city = "אילת"
  → note: "(נגב דרומי - אילת, מצפה רמון, חבל אילות)"

- HE: ערבה, בקעת הערבה | EN: Arava, Arava Valley
  RU: Арава | AR: عربة | FR: Vallée de l'Arava
  → city = "אילת"

- HE: ערבה תיכונה | EN: Central Arava
  → city = "אילת"

- HE: עוטף עזה | EN: Gaza Envelope, Otef Aza
  RU: Газовый огиб, Газовая граница | AR: غلاف غزة
  → city = "שדרות"
  → note: "(עוטף עזה - שדרות, נתיבות, אופקים ויישובי הנגב המערבי)"

- HE: חבל אילות, חבל הצמח | EN: Eilat region, Hevel Eilot
  → city = "אילת"

- HE: מדבר יהודה | EN: Judean Desert
  RU: Иудейская пустыня | AR: صحراء يهودا | FR: Désert de Judée
  → city = "מעלה אדומים"
  → note: "(מדבר יהודה - אזור ים המלח, מעלה אדומים, ערד)"

- HE: ים המלח, אזור ים המלח | EN: Dead Sea area
  RU: Мертвое море | AR: البحر الميت | FR: Mer Morte
  → city = "ערד"
  → note: "(אזור ים המלח - ערד, מעלה אדומים, נופי שלום)"

────── JERUSALEM area sub-regions ──────
- HE: מטה יהודה | EN: Mateh Yehuda, Mate Yehuda
  → city = "בית שמש"
  → note: "(מטה יהודה - מועצה אזורית מערב ירושלים)"

- HE: חבל מודיעין | EN: Modi'in area
  RU: Район Модиин | AR: منطقة موديعين
  → city = "מודיעין"

- HE: גוש עציון | EN: Etzion Bloc, Gush Etzion
  RU: Гуш-Эцион | AR: مجمع عتصيون | FR: Bloc d'Etzion
  → city = "אפרת"
  → note: "(גוש עציון - אפרת, אלון שבות, בת עין, נווה דניאל ועוד)"

- HE: הר חברון | EN: Hebron Hills, Har Hebron
  AR: جبال الخليل
  → city = "אפרת"
  → note: "(הר חברון - יישובים דרום-מזרחית לירושלים)"

- HE: בקעת בית הכרם | EN: Beit Hakerem Valley
  → city = "כרמיאל"

- HE: מערב ירושלים | EN: West Jerusalem
  AR: القدس الغربية | RU: Западный Иерусалим | FR: Jérusalem-Ouest
  → city = "ירושלים"

- HE: מזרח ירושלים | EN: East Jerusalem
  AR: القدس الشرقية | RU: Восточный Иерусалим | FR: Jérusalem-Est
  → city = "ירושלים"
  → note: "(מזרח ירושלים - הכותל, העיר העתיקה ושכונות מזרחיות)"

────── WEST BANK / Judea & Samaria sub-regions ──────
- HE: בנימין, מטה בנימין | EN: Binyamin, Mateh Binyamin
  AR: بنيامين
  → city = "אריאל"
  → note: "(בנימין - יישובים צפונית לירושלים)"

- HE: שומרון | EN: Samaria | AR: السامرة | FR: Samarie | RU: Самария
  → city = "אריאל"
  → note: "(שומרון - אריאל, אלפי מנשה, בית אריה ועוד)"

- HE: יהודה | EN: Judea | AR: يهودا | FR: Judée | RU: Иудея
  → city = "אפרת"
  → note: "(יהודה - אפרת, גוש עציון, מעלה אדומים ועוד)"

- HE: שומרון צפוני | EN: Northern Samaria
  → city = "אריאל"

- HE: שומרון דרומי | EN: Southern Samaria
  → city = "אריאל"

- HE: גוש שילה | EN: Shilo Bloc
  → city = "אריאל"

────── GOVERNMENT DISTRICTS (Machoz) ──────
Israel's 7 administrative districts.  Map to anchor city in each.
- HE: מחוז ירושלים | EN: Jerusalem District   → "ירושלים"
- HE: מחוז הצפון   | EN: Northern District    → "חיפה"
- HE: מחוז חיפה    | EN: Haifa District       → "חיפה"
- HE: מחוז המרכז   | EN: Central District     → "תל אביב"
- HE: מחוז תל אביב | EN: Tel Aviv District    → "תל אביב"
- HE: מחוז הדרום   | EN: Southern District    → "באר שבע"
- HE: מחוז יו"ש, מחוז יהודה ושומרון | EN: Judea & Samaria District → "אריאל"

────── COAST / WATER ──────
- HE: חוף הים התיכון, חוף תיכון | EN: Mediterranean Coast | FR: Côte méditerranéenne
  → city = "תל אביב"
- HE: חוף השרון | EN: Sharon Coast
  → city = "הרצליה"
- HE: חוף הכרמל | EN: Carmel Coast → already above
- HE: כנרת, ים כנרת | EN: Sea of Galilee, Kinneret | AR: بحيرة طبريا
  → city = "טבריה"
- HE: ים סוף, מפרץ אילת | EN: Red Sea, Gulf of Eilat | AR: البحر الأحمر
  → city = "אילת"

═══════════════════════════════════════════════════════════════
NEIGHBORHOODS - famous ones - set BOTH city AND neighborhood
═══════════════════════════════════════════════════════════════
Tel Aviv:
- "Florentin" / "פלורנטין" → city="תל אביב", neighborhood="פלורנטין"
- "Neve Tzedek" / "נווה צדק" → city="תל אביב", neighborhood="נווה צדק"
- "Rothschild" / "רוטשילד" → city="תל אביב", neighborhood="רוטשילד"
- "Old North" / "צפון ישן" / "Tzafon Yashan" → city="תל אביב", neighborhood="צפון ישן"
- "New North" / "צפון חדש" → city="תל אביב", neighborhood="צפון חדש"
- "Yafo" / "Jaffa" / "יפו" → city="תל אביב", neighborhood="יפו"
- "Kerem HaTeimanim" / "כרם התימנים" → city="תל אביב", neighborhood="כרם התימנים"
- "Park HaYarkon area" → city="תל אביב", neighborhood="פארק הירקון"

Jerusalem:
- "Old City" / "העיר העתיקה" → city="ירושלים", neighborhood="העיר העתיקה"
- "Nachlaot" / "נחלאות" → city="ירושלים", neighborhood="נחלאות"
- "Rehavia" / "רחביה" → city="ירושלים", neighborhood="רחביה"
- "Baka" / "בקעה" → city="ירושלים", neighborhood="בקעה"
- "German Colony" / "המושבה הגרמנית" → city="ירושלים", neighborhood="המושבה הגרמנית"
- "Katamon" / "קטמון" → city="ירושלים", neighborhood="קטמון"
- "French Hill" / "גבעה הצרפתית" → city="ירושלים", neighborhood="הגבעה הצרפתית"
- "Ramat Eshkol" → city="ירושלים", neighborhood="רמת אשכול"
- "Pisgat Ze'ev" / "פסגת זאב" → city="ירושלים", neighborhood="פסגת זאב"
- "Har Nof" / "הר נוף" → city="ירושלים", neighborhood="הר נוף"

Haifa:
- "Hadar" → city="חיפה", neighborhood="הדר"
- "Carmel" / "Carmelia" → city="חיפה", neighborhood="כרמל"
- "Bat Galim" → city="חיפה", neighborhood="בת גלים"

Beit Shemesh:
- "RBS"/"RBS A"/"Ramat Beit Shemesh A" → city="בית שמש", neighborhood="רמת בית שמש א"
- "RBS B"/"Ramat Beit Shemesh B" → city="בית שמש", neighborhood="רמת בית שמש ב"

═══════════════════════════════════════════════════════════════
PROPERTY TYPES (CANONICAL HEBREW - must match DB exactly)
═══════════════════════════════════════════════════════════════
The propertyType field MUST be one of these exact Hebrew strings (or null).
Anything else (English, transliterated, etc.) will produce zero results.

- "apartment" / "דירה" / "квартира" / "appartement" / "شقة" → "דירה"
- "studio" / "סטודיו" / "студия" / "loft" / "לופט" → propertyType="סטודיו/ לופט" AND rooms=[1, 1.5] for "studio"
- "penthouse" / "פנטהאוז" / "пентхаус" / "mini-penthouse" / "מיני פנטהאוז" / "roof apartment" / "דירת גג" → "גג/ פנטהאוז"
- "garden apartment" / "דירת גן" / "квартира с садом" → "דירת גן"
- "house" / "private house" / "בית פרטי" / "вилла" / "вилла" / "maison" / "بيت" / "villa" / "וילה" / "cottage" / "קוטג'" / "townhouse" / "טאון האוס" → "בית פרטי/ קוטג'"
- "duplex" / "דופלקס" / "дуплекс" → "דופלקס"
- "triplex" / "טריפלקס" → "טריפלקס"
- "duplex family" / "semi-detached" / "דו משפחתי" → "דו משפחתי"
- "new project" / "פרויקט חדש" / "новостройка" → "פרויקט חדש"
- "studio unit" / "מיני דירה" / "יחידת דיור" → "יחידת דיור"
- "land" / "plot" / "מגרש" / "מגרשים" / "земельный участок" → "מגרשים"
- "parking" / "חניה" / "парковка" → "חניה"
- "storage" / "מחסן" / "склад" → "מחסן"
- "building" / "בניין מגורים" / "residential building" → "בניין מגורים"
- "sublet" / "סאבלט" → "סאבלט"
- "farm" / "agricultural" / "משק חקלאי" / "נחלה" → "משק חקלאי/ נחלה"
- General/unspecified → "כללי"

═══════════════════════════════════════════════════════════════
DEAL TYPE
═══════════════════════════════════════════════════════════════
- rent: "rent" / "rental" / "lease" / "להשכרה" / "שכירות" / "аренда" / "снять" / "à louer" / "location" / "للإيجار"
- forsale: "buy" / "sale" / "purchase" / "למכירה" / "למכור" / "продажа" / "купить" / "à vendre" / "achat" / "للبيع"
- sublet/sublease/saver/саблет → dealType="rent" AND keyword="סאבלט"
- "investment" / "השקעה" / "buy-to-let" → dealType="forsale" AND keyword="השקעה"
- "vacation rental" / "Airbnb" / "short term" / "קצר טווח" → dealType="rent" AND keyword="קצר טווח"

═══════════════════════════════════════════════════════════════
ROOMS
═══════════════════════════════════════════════════════════════
- "3 rooms" / "3 חדרים" / "3-комнатная" / "3 pièces" / "3BR" → [3]
- "3.5" / "3 וחצי" → [3.5]
- "3-4 rooms" / "3 או 4" / "3 to 4" → [3, 3.5, 4]
- "at least 3" / "מ-3 ומעלה" → [3, 3.5, 4, 4.5, 5, 5.5, 6, 7]
- "up to 4" / "עד 4 חדרים" → [1, 1.5, 2, 2.5, 3, 3.5, 4]
- "studio" → [1, 1.5]
- "1 bedroom" / "1BR" / "1 חדר שינה" - Israeli usage: total rooms = bedrooms + 1 (living room), so 1BR ≈ 2 rooms → [2]
- "2 bedrooms" → [3]; "3 bedrooms" → [4]
- "3+1" - Israeli notation (3 main rooms + small room) → [3.5]

═══════════════════════════════════════════════════════════════
MONEY UNITS
═══════════════════════════════════════════════════════════════
- "M" / "millions" / "מיליון" / "млн" / "M€" → ×1,000,000
- "K" / "thousand" / "אלף" / "тыс" / "mille" / "ألف" → ×1,000
- "מיליון וחצי" / "1.5M" / "1,5 миллиона" → 1,500,000
- "מיליון רבע" → 1,250,000
- "2 וחצי מיליון" / "2.5M" → 2,500,000
- "8K shekel" / "8 אלף שקל" / "8 тысяч шек" → 8,000
- "5000 ש"ח" / "5000 шек" / "5000 NIS" / "₪5000" → 5000

═══════════════════════════════════════════════════════════════
LIFESTYLE / COMMUNITY - put in "keyword" (Hebrew, for description substring match)
═══════════════════════════════════════════════════════════════
- "religious" / "דתי" / "frum" / "shomer shabbat" → keyword="דתי"
- "haredi" / "חרדי" / "ultra-orthodox" → keyword="חרדי"
- "secular" / "חילוני" / "светский" / "laïque" → keyword="חילוני"
- "religious-zionist" / "dati leumi" / "דתי לאומי" → keyword="דתי לאומי"
- "mixed religious-secular" / "מעורב" → keyword="מעורב"
- "Anglo" / "English speaking" / "for olim from US" / "American community" → keyword="אנגלוסקסי"
- "French community" / "Olim Francais" → keyword="צרפתי"
- "Russian community" / "русская община" → keyword="רוסי"
- "Yemenite" / "Mizrahi" - usually not searchable, skip
- "family-friendly" / "משפחתי" / "for families" / "family neighborhood" → keyword="משפחתי"
- "young people" / "לצעירים" / "young professionals" → keyword="צעירים"
- "students" / "סטודנטים" → keyword="סטודנטים"
- "single" / "רווקים" → keyword="רווקים"
- "couple" / "לזוג" → keyword="לזוג"
- "quiet" / "שקט" / "тихий" / "calme" → keyword="שקט"
- "lively" / "תוסס" / "nightlife" / "trendy" → keyword="תוסס"
- "upscale" / "יוקרתי" / "luxury" / "elegant" → keyword="יוקרתי"
- "investment area" / "אזור השקעה" / "up-and-coming" → keyword="השקעה"
- "safe area" / "אזור בטוח" → keyword="בטוח"
- "pet-friendly" / "חיות מחמד" / "dogs allowed" → keyword="חיות מחמד"

═══════════════════════════════════════════════════════════════
"NEAR X" CONCEPTS - put in "keyword" (Hebrew, for description match)
═══════════════════════════════════════════════════════════════
Every concept below also accepts common misspellings, phonetic
variants, and Hebrew/English/Russian/French/Arabic forms.  If the
user mentions MORE THAN ONE "near X" concept, join with spaces:
keyword="ים פארק" (matches listings mentioning both).

  ─── Transit ───
  - beach / sea / waterfront / ליד הים / נוף לים / на пляже / у моря /
    plage / shore / oceanfront / חוף הים / חוף → keyword="ים"
  - train / רכבת / поезд / train / station / תחנת רכבת → keyword="רכבת"
  - light rail / רכבת קלה / трамвай / tramway / metro → keyword="רכבת קלה"
  - bus / אוטובוס / автобус / arret de bus → keyword="אוטובוס"
  - airport / נמל תעופה / аэропорт / aeroport / TLV / Ben Gurion → keyword="נמל תעופה"

  ─── Public spaces ───
  - park / פארק / парк / parc / حديقة / playground / מגרש משחקים → keyword="פארק"
  - beach / sea / coast → keyword="ים" (covered above)
  - promenade / טיילת / nabережная / promenade → keyword="טיילת"
  - garden / גינה / sad / jardin → keyword="גינה"
  - mountain / view / נוף / mountain view / sea view → keyword="נוף"

  ─── Religious institutions ───
  - synagogue / בית כנסת / shul / shtibl / синагога / synagogue / كنيس → keyword="בית כנסת"
  - mosque / مسجد / мечеть / mosquée / mosque / mesjid → keyword="מסגד"
  - church / כנסייה / церковь / église / kirche / كنيسة → keyword="כנסייה"
  - mikvah / mikveh / מקווה / mikve → keyword="מקווה"
  - yeshiva / ישיבה / ешива / yeshivah → keyword="ישיבה"
  - kollel / כולל → keyword="כולל"
  - chabad house / בית חב"ד / chabad → keyword="חבד"

  ─── Education ───
  - school / בית ספר / школа / école / مدرسة → keyword="בית ספר"
  - elementary school / בית ספר יסודי → keyword="יסודי"
  - high school / תיכון / lycée → keyword="תיכון"
  - kindergarten / גן ילדים / детский сад / maternelle / preschool → keyword="גן ילדים"
  - daycare / מעון / nursery / crèche → keyword="מעון"
  - university / college / אוניברסיטה / מכללה / университет / université / TAU / HU / Technion → keyword="אוניברסיטה"
  - library / ספרייה / bibliothèque / библиотека → keyword="ספרייה"
  - bilingual school / international school / כיתות אנגלית → keyword="בינלאומי"

  ─── Health & emergency ───
  - hospital / בית חולים / больница / hôpital / مستشفى / Ichilov / Hadassah / Rambam → keyword="בית חולים"
  - clinic / kupat holim / קופת חולים / Maccabi / Clalit / Meuhedet / Leumit → keyword="קופת חולים"
  - pharmacy / בית מרקחת / аптека / pharmacie / صيدلية / Super-Pharm / SuperPharm → keyword="בית מרקחת"
  - dentist / רופא שיניים / dentiste / стоматолог → keyword="רופא שיניים"

  ─── Shopping & food ───
  - mall / קניון / shopping center / торговый центр / centre commercial → keyword="קניון"
  - supermarket / סופר / סופרמרקט / Shufersal / Rami Levy / Victory / AM:PM → keyword="סופר"
  - market / shuk / שוק / Carmel Market / Mahane Yehuda → keyword="שוק"
  - bakery / מאפייה / boulangerie / מאפה → keyword="מאפייה"
  - cafe / coffee shop / בית קפה / café → keyword="בית קפה"
  - restaurant / מסעדה / restaurant / مطعم → keyword="מסעדה"
  - kosher restaurant / מסעדה כשרה → keyword="כשר"

  ─── Lifestyle / amenities ───
  - gym / fitness / חדר כושר / спортзал / salle de sport / sports center → keyword="חדר כושר"
  - pool / swimming / בריכה / бассейн / piscine → keyword="בריכה"
  - tennis / tennis court / מגרש טניס → keyword="טניס"
  - basketball court / מגרש כדורסל → keyword="כדורסל"
  - dog park / off-leash → keyword="כלבים"
  - nightlife / bars / pubs / clubs / חיי לילה → keyword="חיי לילה"

  ─── Services ───
  - bank / банк / banque → keyword="בנק"
  - post office / דואר → keyword="דואר"
  - police station / משטרה / police → keyword="משטרה"
  - municipality / עירייה / mairie → keyword="עירייה"

  ─── Generic location qualifiers ───
  - city center / merkaz ha'ir / מרכז העיר / center of city (the BUILDING's location, distinct from country-region "center") → keyword="מרכז העיר"
  - quiet street / רחוב שקט / тихая улица → keyword="רחוב שקט"
  - main road / רחוב ראשי → keyword="ראשי"

If the user combines multiple "near X" terms, concatenate the Hebrew
keywords with spaces (e.g. "park AND synagogue" → keyword="פארק בית כנסת").
Don't drop the keyword just because the user didn't say "near" - phrases
like "with a pool", "with synagogue nearby", "next to the beach", "by
the train", "close to school" all count.

═══════════════════════════════════════════════════════════════
TYPO / SPELLING TOLERANCE - be forgiving
═══════════════════════════════════════════════════════════════
Match phonetically/loosely.  Common misspellings to handle:
- "appartment" / "apartmant" / "apartement" / "apratment" → apartment
- "pentahouse" / "penthose" / "panthouse" → penthouse
- "sinagog" / "sinegogue" / "synagouge" / "shul" → synagogue
- "florintin" / "florantin" / "florentine" → Florentin
- "tel-aviv" / "telaviv" / "tlv" / "the city" → Tel Aviv
- "yerushalaim" / "jerusalem" / "j-lem" → Jerusalem
- "jaffa" / "yafo" / "yafa" → Tel Aviv (neighborhood: Yafo)
- "nehariya" / "nahriya" → Nahariya
- "raanana" / "ra'anana" / "raanana" / "ranana" → Raanana
- "modien" / "modi'in" / "modi-in" → Modi'in
- "kosher" / "koscher" / "kosher kitchen" → keyword="כשר"
- "mamad" / "mam'ad" / "safe room" / "shelter room" → features.mamad
- "studio" / "studeo" / "studi" → studio
- "milion" / "milyon" / "מילון" (with no context) → million (NIS)

Rules for fuzzy matching:
- Try the closest canonical spelling first.  If it's plausibly a city
  from the canonical list, use that city.
- If it's plausibly a Hebrew word with Latin chars (transliteration),
  map to its Hebrew form.
- Don't refuse to parse - fall through to keyword=<their query>
  rather than returning all-nulls.  Better to over-match than to
  return zero results.
- If the user types only a number ("8000"), assume it's a price
  (priceMax) and don't ask for clarification.

═══════════════════════════════════════════════════════════════
FLOOR / POSITION
═══════════════════════════════════════════════════════════════
- "ground floor" / "קומת קרקע" / "первый этаж" - set keyword="קומת קרקע" (no structured filter)
- "top floor" / "קומה אחרונה" / "high floor" / "קומה גבוהה" - set keyword="קומה גבוהה"
- "low floor" / "קומה נמוכה" - keyword="קומה נמוכה"
- "with sea view" / "נוף לים" → keyword="נוף לים"
- "with view" / "נוף" → keyword="נוף"

═══════════════════════════════════════════════════════════════
CONDITION / RENOVATION
═══════════════════════════════════════════════════════════════
- "new" / "חדש" / "from contractor" / "מקבלן" → keyword="חדש"
- "renovated" / "משופץ" / "after renovation" → keyword="משופץ"
- "needs renovation" / "לשיפוץ" / "needs work" → keyword="לשיפוץ"
- "original" / "מקורי" → keyword="מקורי"
- "old" / "ישן" / "Bauhaus" → keyword="ישן"

═══════════════════════════════════════════════════════════════
URBAN RENEWAL (Israeli-specific)
═══════════════════════════════════════════════════════════════
- "TAMA 38" / "תמא 38" - IMPORTANT: write keyword WITHOUT the internal quote → keyword="תמא 38"
- "Pinui Binui" / "פינוי בינוי" → keyword="פינוי בינוי"
- "Mechir Lamishtaken" / "מחיר למשתכן" / subsidized housing → keyword="מחיר למשתכן"

CRITICAL JSON RULE: Never put unescaped double quotes inside your output string values. Hebrew abbreviations like תמ"א / נדל"ן / חוה"ק should be written without the internal quote (use תמא / נדלן / חוהק) so the JSON parses cleanly.

═══════════════════════════════════════════════════════════════
NEGATIVE QUALIFIERS - "without X" / "no X" / "בלי X"
═══════════════════════════════════════════════════════════════
If the user says "without parking" / "בלי חניה" / "no elevator" / "без лифта":
- DO NOT set the feature flag (we can't filter for "absence" with our schema)
- Add it to "understood" so the user knows we couldn't honor that: e.g., "(הערה: לא ניתן לסנן 'בלי חניה' - תוצגנה כל הדירות במחיר זה)"

═══════════════════════════════════════════════════════════════
TIME / AVAILABILITY (we don't have these as filters - note in "understood")
═══════════════════════════════════════════════════════════════
- "immediate" / "מיידי" / "from next month" - note in understood, no filter change
- "long-term" / "ארוך טווח" - implicit for "rent", no filter change
- "yearly lease" / "שנתי" - note in understood

═══════════════════════════════════════════════════════════════
SLOPPY / NOISE - ignore silently
═══════════════════════════════════════════════════════════════
"looking for" / "מחפש" / "ищу" / "I want" / "I need" / "show me" / "find me" / "תראה לי" / "want" / "wanna"

═══════════════════════════════════════════════════════════════
PRICING CONCEPTS
═══════════════════════════════════════════════════════════════
- "cheap" / "זול" - without a number, set priceMax based on context: rent ≤ 5000, sale ≤ 1,500,000
- "expensive" / "יקר" / "luxury" - leave priceMin/Max null, set keyword="יוקרתי"
- "best deal" / "המחיר הטוב ביותר" - just note in understood, sort by price asc client-side (no filter)
- "negotiable" / "ניתן להתמקח" - note in understood

═══════════════════════════════════════════════════════════════
FALLBACK
═══════════════════════════════════════════════════════════════
If you cannot parse ANY specific filter, return all-null filters with keyword set to the original query text trimmed.

The "understood" field MUST always be set - write a short Hebrew sentence describing what was parsed and which assumptions you made.

Return ONLY the JSON object. No markdown fences, no preamble.`

interface ParsedFilters {
  city: string | null
  neighborhood: string | null
  dealType: 'rent' | 'forsale' | null
  priceMin: number | null
  priceMax: number | null
  rooms: number[] | null
  sizeMin: number | null
  sizeMax: number | null
  propertyType: string | null
  features: Partial<Record<string, true>> | null
  keyword: string | null
  understood: string
}

function buildQueryUrl(parsed: ParsedFilters): string {
  // URL param names match Search.tsx exactly (verified against the
  // file: rooms is comma-separated, features are individual flags
  // like ?parking=1&elevator=1, keyword param is `keyword`).
  const params = new URLSearchParams()
  if (parsed.city)         params.set('city',         parsed.city)
  if (parsed.neighborhood) params.set('neighborhood', parsed.neighborhood)
  if (parsed.dealType)     params.set('dealType',     parsed.dealType)
  if (parsed.priceMin)     params.set('priceMin',     String(parsed.priceMin))
  if (parsed.priceMax)     params.set('priceMax',     String(parsed.priceMax))
  if (parsed.rooms && parsed.rooms.length > 0) {
    params.set('rooms', parsed.rooms.join(','))
  }
  if (parsed.sizeMin)      params.set('sizeMin',      String(parsed.sizeMin))
  if (parsed.sizeMax)      params.set('sizeMax',      String(parsed.sizeMax))
  if (parsed.propertyType) params.set('propertyType', parsed.propertyType)
  if (parsed.keyword)      params.set('keyword',      parsed.keyword)
  // Features: one URL param per flag, value=1.  Search.tsx's parseFeaturesFromUrl
  // reads camelCase keys (airConditioning, storageRoom), but the model emits
  // snake_case (air_conditioning, storage_room) - map them or those two filters
  // are silently dropped.
  if (parsed.features) {
    for (const [key, val] of Object.entries(parsed.features)) {
      if (val) params.set(FEATURE_URL_PARAM[key] ?? key, '1')
    }
  }
  return `/search?${params.toString()}`
}

// Model feature key (snake_case, == DB column) → Search.tsx URL param (camelCase).
const FEATURE_URL_PARAM: Record<string, string> = {
  air_conditioning: 'airConditioning',
  storage_room:     'storageRoom',
}

// Mirror of Search.tsx's PROPERTY_TYPE_NORMALIZE so the queryUrl carries the
// canonical Hebrew string the DB stores (and so counting below is accurate).
const PROPERTY_TYPES = new Set([
  'דירה', 'דירת גן', 'פרויקט חדש', "בית פרטי/ קוטג'", 'דו משפחתי', 'דופלקס',
  'טריפלקס', 'גג/ פנטהאוז', 'יחידת דיור', 'בניין מגורים', 'סטודיו/ לופט',
  'משק חקלאי/ נחלה', 'מגרשים', 'מחסן', 'חניה', 'סאבלט', 'כללי',
])
const PROPERTY_TYPE_NORMALIZE: Record<string, string> = {
  apartment: 'דירה', flat: 'דירה', квартира: 'דירה', appartement: 'דירה', شقة: 'דירה',
  studio: 'סטודיו/ לופט', loft: 'סטודיו/ לופט', לופט: 'סטודיו/ לופט', סטודיו: 'סטודיו/ לופט',
  penthouse: 'גג/ פנטהאוז', פנטהאוז: 'גג/ פנטהאוז', пентхаус: 'גג/ פנטהאוז',
  'mini-penthouse': 'גג/ פנטהאוז', mini_penthouse: 'גג/ פנטהאוז', roof_apartment: 'גג/ פנטהאוז',
  garden_apartment: 'דירת גן', 'garden apartment': 'דירת גן',
  house: "בית פרטי/ קוטג'", villa: "בית פרטי/ קוטג'", וילה: "בית פרטי/ קוטג'", вилла: "בית פרטי/ קוטג'",
  maison: "בית פרטי/ קוטג'", بيت: "בית פרטי/ קוטג'", cottage: "בית פרטי/ קוטג'", townhouse: "בית פרטי/ קוטג'",
  duplex: 'דופלקס', дуплекс: 'דופלקס', triplex: 'טריפלקס', duplex_family: 'דו משפחתי',
  semi_detached: 'דו משפחתי', new_project: 'פרויקט חדש', parking: 'חניה', storage: 'מחסן',
  land: 'מגרשים', plot: 'מגרשים', building: 'בניין מגורים', sublet: 'סאבלט',
  studio_unit: 'יחידת דיור', agricultural: 'משק חקלאי/ נחלה', farm: 'משק חקלאי/ נחלה',
}
function normalizePropertyType(input: string | null): string | null {
  if (!input) return input
  if (PROPERTY_TYPES.has(input)) return input
  return PROPERTY_TYPE_NORMALIZE[input.toLowerCase().trim()] ?? PROPERTY_TYPE_NORMALIZE[input] ?? input
}


// Per-IP soft rate-limit.  Each search costs a cached-8K-token Anthropic
// call — expensive if abused.  Warm-Lambda-only Map is fine for the free
// tier; upgrade to Redis if abuse becomes a real problem.
const RATE_LIMIT_WINDOW_MS = 3_000
const recentSearches = new Map<string, number>()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const query = typeof body.query === 'string' ? body.query.trim() : ''

  if (query.length < 2) {
    return res.status(400).json({ error: 'query_too_short' })
  }
  if (query.length > 500) {
    return res.status(400).json({ error: 'query_too_long' })
  }

  // Rate-limit
  const fwd = req.headers['x-forwarded-for']
  const ip = typeof fwd === 'string'
    ? fwd.split(',')[0]!.trim()
    : Array.isArray(fwd) ? fwd[0]!.split(',')[0]!.trim() : 'unknown'
  const now = Date.now()
  const last = recentSearches.get(ip)
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({ error: 'rate_limited' })
  }
  recentSearches.set(ip, now)
  if (recentSearches.size > 1000) {
    for (const [k, v] of recentSearches) {
      if (now - v > RATE_LIMIT_WINDOW_MS) recentSearches.delete(k)
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ai-search] ANTHROPIC_API_KEY not set')
    return res.status(503).json({ error: 'ai_unavailable' })
  }

  // Warm the city cache in parallel with the (slower) Anthropic call.
  const citiesReady = loadCities()

  let parsed: ParsedFilters
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      // SYSTEM_PROMPT is ~8K tokens and identical across every call - sending
      // it as a structured cacheable block (cache_control: ephemeral) makes
      // Anthropic cache it server-side.  Cached reads bill at 10% of normal
      // input-token cost, so per-query ITPM use drops ~85-90% after the
      // first call in a 5-min window.  Critical for staying under Tier 1
      // Haiku's 50K ITPM ceiling when many users hit /api/ai-search in
      // a burst (which is what triggers the rate-limit email).
      body: JSON.stringify({
        model:       MODEL,
        // 600 → 1200: gives Haiku room for a richer "understood" summary
        // when the query has multiple region + lifestyle + feature terms
        // without hitting max_tokens mid-JSON and returning malformed output.
        max_tokens:  1200,
        system: [
          {
            type:          'text',
            text:          SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages:    [{ role: 'user', content: query }],
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[ai-search] anthropic error:', resp.status, errText.slice(0, 200))
      return res.status(502).json({ error: 'ai_error' })
    }
    const data = await resp.json() as { content?: { type: string; text: string }[] }
    const text = data.content?.find(c => c.type === 'text')?.text ?? ''
    if (!text) {
      console.error('[ai-search] empty response from Anthropic')
      return res.status(502).json({ error: 'ai_empty_response' })
    }
    // Strip markdown fences if Claude added them despite instructions
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    parsed = JSON.parse(cleaned) as ParsedFilters
  } catch (err) {
    console.error('[ai-search] parse failed:', err)
    return res.status(502).json({ error: 'ai_parse_failed' })
  }

  // Defensive: normalise nulls vs missing keys
  parsed.city         ??= null
  parsed.neighborhood ??= null
  parsed.dealType     ??= null
  parsed.priceMin     ??= null
  parsed.priceMax     ??= null
  parsed.rooms        ??= null
  parsed.sizeMin      ??= null
  parsed.sizeMax      ??= null
  parsed.propertyType ??= null
  parsed.features     ??= null
  parsed.keyword      ??= null

  // 1) Snap the city to the EXACT spelling the DB stores (else exact-match → 0).
  await citiesReady
  parsed.city = snapCity(parsed.city)
  // 2) Normalise property type to the canonical Hebrew the DB stores.
  parsed.propertyType = normalizePropertyType(parsed.propertyType)

  // NOTE: graceful relaxation (dropping narrow filters that would zero results -
  // e.g. the keyword/description filter, which can't match the ~90% of listings
  // with no description) is done CLIENT-SIDE in Search.tsx, so the user sees the
  // "closest match" banner on the results page. The endpoint just parses + snaps.
  const queryUrl = buildQueryUrl(parsed)

  return res.status(200).json({
    filters:    parsed,
    understood: parsed.understood ?? query,
    queryUrl,
  })
}
