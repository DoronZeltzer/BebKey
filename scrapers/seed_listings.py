"""
BebKey - Seed realistic Israeli real-estate listings into Supabase.
Run: python seed_listings.py
"""
import os
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv
import httpx
import json

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Picsum gives real photos - each seed=N returns the same consistent image
def imgs(*seeds):
    return [f"https://picsum.photos/seed/{s}/800/600" for s in seeds]

LISTINGS = [
    # ── Tel Aviv ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-001",
         price=3200000, city="תל אביב", street="דיזנגוף", neighborhood="הצפון הישן",
         size_m2=85, rooms=3.0, floor=4, property_type="דירה",
         description="דירת 3 חדרים מרוהטת ברחוב דיזנגוף. קומה 4 עם מעלית. שיפוץ מלא.",
         contact_phone="052-1000001", images=imgs("apt1","apt2","apt3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-002",
         price=5800000, city="תל אביב", street="אלנבי", neighborhood="לב העיר",
         size_m2=120, rooms=4.0, floor=7, property_type="דירה",
         description="דירת 4 חדרים עם נוף לים. מרפסת שמש גדולה. חניה וממ\"ד.",
         contact_phone="052-1000002", images=imgs("sea1","sea2","sea3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-003",
         price=2450000, city="תל אביב", street="בן יהודה", neighborhood="הצפון הישן",
         size_m2=65, rooms=2.5, floor=2, property_type="דירה",
         description="דירת 2.5 חדרים לאחר שיפוץ. קרובה לים ולתחבורה ציבורית.",
         contact_phone="052-1000003", images=imgs("room1","room2"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-004",
         price=9800000, city="תל אביב", street="הירקון", neighborhood="לב העיר",
         size_m2=220, rooms=6.0, floor=15, property_type="פנטהאוז",
         description="פנטהאוז יוקרה עם נוף מושלם לים. 3 חניות ומחסן גדול.",
         contact_phone="052-1000004", images=imgs("penthouse1","penthouse2","penthouse3","penthouse4"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-005",
         price=6500, city="תל אביב", street="רוטשילד", neighborhood="לב העיר",
         size_m2=70, rooms=3.0, floor=2, property_type="שכירות",
         description="דירת 3 חדרים להשכרה על שדרות רוטשילד. מרוהטת חלקית.",
         contact_phone="052-1000005", images=imgs("rent1","rent2","rent3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-006",
         price=3300, city="תל אביב", street="לוינסקי", neighborhood="פלורנטין",
         size_m2=40, rooms=1.5, floor=1, property_type="שכירות",
         description="סטודיו מגניב בפלורנטין. קרוב לכל מוקדי הבילוי.",
         contact_phone="052-1000006", images=imgs("studio1","studio2"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-007",
         price=4200000, city="תל אביב", street="שינקין", neighborhood="לב העיר",
         size_m2=110, rooms=4.0, floor=3, property_type="דירה",
         description="דירת 4 חדרים בלב תל אביב עם מרפסת ישיבה. חניה כלולה.",
         contact_phone="052-1000007", images=imgs("apt4","apt5","apt6"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-008",
         price=7800, city="תל אביב", street="ארלוזורוב", neighborhood="הצפון הישן",
         size_m2=90, rooms=3.5, floor=5, property_type="שכירות",
         description="דירת 3.5 חדרים מרוהטת, שיפוץ חדש, מעלית וחניה.",
         contact_phone="052-1000008", images=imgs("rent4","rent5"), is_active=True),

    # ── Jerusalem ─────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-009",
         price=2900000, city="ירושלים", street="אגריפס", neighborhood="נחלאות",
         size_m2=95, rooms=4.0, floor=1, property_type="דירה",
         description="דירת 4 חדרים בשכונת נחלאות ההיסטורית. חצר פרטית.",
         contact_phone="052-1000009", images=imgs("jlm1","jlm2","jlm3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-010",
         price=4100000, city="ירושלים", street="המלך דוד", neighborhood="רחביה",
         size_m2=130, rooms=5.0, floor=3, property_type="דירה",
         description="דירת 5 חדרים מרווחת ברחביה. קרובה לשגרירויות ולמוסדות.",
         contact_phone="052-1000010", images=imgs("jlm4","jlm5","jlm6"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-011",
         price=4200, city="ירושלים", street="יפו", neighborhood="מרכז העיר",
         size_m2=55, rooms=2.0, floor=3, property_type="שכירות",
         description="דירת 2 חדרים בלב ירושלים. קרובה לשוק מחנה יהודה.",
         contact_phone="052-1000011", images=imgs("jlm7","jlm8"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-012",
         price=3500000, city="ירושלים", street="עמק רפאים", neighborhood="המושבה הגרמנית",
         size_m2=105, rooms=4.0, floor=2, property_type="דירה",
         description="דירה מרווחת במושבה הגרמנית. סלון גדול, מטבח מעוצב.",
         contact_phone="052-1000012", images=imgs("jlm9","jlm10","jlm11"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-013",
         price=5500, city="ירושלים", street="בצלאל", neighborhood="נחלאות",
         size_m2=75, rooms=3.0, floor=2, property_type="שכירות",
         description="דירת 3 חדרים בנחלאות. שכונה שקטה, קרובה לשוק.",
         contact_phone="052-1000013", images=imgs("jlm12","jlm13"), is_active=True),

    # ── Haifa ─────────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-014",
         price=1750000, city="חיפה", street="הנשיא", neighborhood="הכרמל",
         size_m2=100, rooms=4.0, floor=5, property_type="דירה",
         description="דירה עם נוף פנורמי לים ולמפרץ חיפה. שיפוץ חדש.",
         contact_phone="052-1000014", images=imgs("haifa1","haifa2","haifa3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-015",
         price=5200, city="חיפה", street="שדרות הנשיא", neighborhood="הכרמל",
         size_m2=90, rooms=3.5, floor=3, property_type="שכירות",
         description="דירת 3.5 חדרים להשכרה בכרמל. נוף עוצר נשימה לים.",
         contact_phone="052-1000015", images=imgs("haifa4","haifa5"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-016",
         price=1400000, city="חיפה", street="ויצמן", neighborhood="נווה שאנן",
         size_m2=80, rooms=3.0, floor=2, property_type="דירה",
         description="דירת 3 חדרים בנווה שאנן. קרובה לאוניברסיטה.",
         contact_phone="052-1000016", images=imgs("haifa6","haifa7"), is_active=True),

    # ── Herzliya ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-017",
         price=6500000, city="הרצליה", street="רמת הנדיב", neighborhood="הרצליה פיתוח",
         size_m2=180, rooms=5.0, floor=8, property_type="דירת גן",
         description="פנטהאוז עם נוף לים בהרצליה פיתוח. 2 חניות ומחסן.",
         contact_phone="052-1000017", images=imgs("herz1","herz2","herz3","herz4"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-018",
         price=8500, city="הרצליה", street="סוקולוב", neighborhood="מרכז",
         size_m2=100, rooms=4.0, floor=4, property_type="שכירות",
         description="דירת 4 חדרים מרוהטת במרכז הרצליה. חניה ומחסן.",
         contact_phone="052-1000018", images=imgs("herz5","herz6"), is_active=True),

    # ── Ra'anana ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-019",
         price=3800000, city="רעננה", street="אחוזה", neighborhood="מרכז",
         size_m2=130, rooms=5.0, floor=2, property_type="דירה",
         description="דירת 5 חדרים מרווחת ברעננה. שכונת מגורים יוקרתית.",
         contact_phone="052-1000019", images=imgs("ra1","ra2","ra3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-020",
         price=7200, city="רעננה", street="ויצמן", neighborhood="מרכז",
         size_m2=110, rooms=4.0, floor=3, property_type="שכירות",
         description="דירת 4 חדרים ברעננה. גינה משותפת ובריכה.",
         contact_phone="052-1000020", images=imgs("ra4","ra5"), is_active=True),

    # ── Beer Sheva ────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-021",
         price=1850000, city="באר שבע", street="רגר", neighborhood="גאולים",
         size_m2=125, rooms=5.0, floor=0, property_type="קוטג'",
         description="קוטג' דו-קומתי עם חצר ובריכה. שכונה שקטה.",
         contact_phone="052-1000021", images=imgs("house1","house2","house3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-022",
         price=1200000, city="באר שבע", street="הנגב", neighborhood="מרכז",
         size_m2=75, rooms=3.0, floor=1, property_type="דירה",
         description="דירת 3 חדרים קרובה לאוניברסיטת בן גוריון.",
         contact_phone="052-1000022", images=imgs("bs1","bs2"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-023",
         price=3200, city="באר שבע", street="שד' רגר", neighborhood="נאות לון",
         size_m2=65, rooms=2.5, floor=3, property_type="שכירות",
         description="דירת 2.5 חדרים להשכרה. מרוהטת, מזגן, חניה.",
         contact_phone="052-1000023", images=imgs("bs3","bs4"), is_active=True),

    # ── Netanya ───────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-024",
         price=2100000, city="נתניה", street="הרצל", neighborhood="מרכז",
         size_m2=80, rooms=3.0, floor=4, property_type="דירה",
         description="דירת 3 חדרים בנתניה. מרפסת, חניה ומחסן כלולים.",
         contact_phone="052-1000024", images=imgs("net1","net2","net3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-025",
         price=2800000, city="נתניה", street="שד' בנימין", neighborhood="עיר ימים",
         size_m2=100, rooms=4.0, floor=6, property_type="דירה",
         description="דירת 4 חדרים עם נוף לים. קרובה לחוף.",
         contact_phone="052-1000025", images=imgs("net4","net5","net6"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-026",
         price=5800, city="נתניה", street="שד' הציונות", neighborhood="מרכז",
         size_m2=85, rooms=3.0, floor=2, property_type="שכירות",
         description="דירת 3 חדרים בנתניה להשכרה. חניה כלולה.",
         contact_phone="052-1000026", images=imgs("net7","net8"), is_active=True),

    # ── Ramat Gan ─────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-027",
         price=7800, city="רמת גן", street="ביאליק", neighborhood="מרכז",
         size_m2=110, rooms=4.0, floor=6, property_type="שכירות",
         description="דירת 4 חדרים ברמת גן. עם חניה, מחסן ומרפסת.",
         contact_phone="052-1000027", images=imgs("rg1","rg2","rg3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-028",
         price=3100000, city="רמת גן", street="ז'בוטינסקי", neighborhood="מרכז",
         size_m2=115, rooms=4.5, floor=8, property_type="דירה",
         description="דירת 4.5 חדרים מודרנית עם נוף לגוש דן. מעלית ושומר.",
         contact_phone="052-1000028", images=imgs("rg4","rg5","rg6"), is_active=True),

    # ── Petah Tikva ───────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-029",
         price=2400000, city="פתח תקוה", street="ז'בוטינסקי", neighborhood="מרכז",
         size_m2=95, rooms=4.0, floor=3, property_type="דירה",
         description="דירת 4 חדרים בפתח תקוה. שיפוץ חדש, מטבח מעוצב.",
         contact_phone="052-1000029", images=imgs("pt1","pt2","pt3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-030",
         price=5500, city="פתח תקוה", street="הרצל", neighborhood="מרכז",
         size_m2=80, rooms=3.0, floor=2, property_type="שכירות",
         description="דירת 3 חדרים בפתח תקוה. קרובה לתחבורה ציבורית.",
         contact_phone="052-1000030", images=imgs("pt4","pt5"), is_active=True),

    # ── Rishon LeZion ─────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-031",
         price=2600000, city="ראשון לציון", street="רוטשילד", neighborhood="מרכז",
         size_m2=100, rooms=4.0, floor=4, property_type="דירה",
         description="דירת 4 חדרים בראשון לציון. חניה פרטית ומחסן.",
         contact_phone="052-1000031", images=imgs("rl1","rl2","rl3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-032",
         price=6500, city="ראשון לציון", street="הרצל", neighborhood="מרכז",
         size_m2=90, rooms=3.5, floor=5, property_type="שכירות",
         description="דירת 3.5 חדרים בראשון לציון. חדשה, שיפוץ מלא.",
         contact_phone="052-1000032", images=imgs("rl4","rl5"), is_active=True),

    # ── Ashdod ────────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-033",
         price=1650000, city="אשדוד", street="שד' הנשיא", neighborhood="רובע ז",
         size_m2=88, rooms=4.0, floor=3, property_type="דירה",
         description="דירת 4 חדרים באשדוד. מרפסת גדולה, נוף פתוח.",
         contact_phone="052-1000033", images=imgs("ash1","ash2","ash3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-034",
         price=4500, city="אשדוד", street="הפלמ\"ח", neighborhood="רובע ח",
         size_m2=70, rooms=3.0, floor=2, property_type="שכירות",
         description="דירת 3 חדרים להשכרה באשדוד. מרוהטת, קרובה לים.",
         contact_phone="052-1000034", images=imgs("ash4","ash5"), is_active=True),

    # ── Holon ─────────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-035",
         price=2200000, city="חולון", street="סוקולוב", neighborhood="מרכז",
         size_m2=85, rooms=3.5, floor=4, property_type="דירה",
         description="דירת 3.5 חדרים בחולון. קרובה לתל אביב, חניה כלולה.",
         contact_phone="052-1000035", images=imgs("hol1","hol2","hol3"), is_active=True),

    # ── Eilat ─────────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-036",
         price=2900000, city="אילת", street="שד' התמרים", neighborhood="מרכז",
         size_m2=95, rooms=3.0, floor=2, property_type="דירה",
         description="דירת 3 חדרים באילת. נוף להרים, בריכה משותפת.",
         contact_phone="052-1000036", images=imgs("eilat1","eilat2","eilat3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-037",
         price=6000, city="אילת", street="הדקל", neighborhood="מרכז",
         size_m2=60, rooms=2.0, floor=1, property_type="שכירות",
         description="דירת 2 חדרים באילת להשכרה. קרובה לחוף ולמרכז הקניות.",
         contact_phone="052-1000037", images=imgs("eilat4","eilat5"), is_active=True),

    # ── Modi'in ───────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-038",
         price=3200000, city="מודיעין", street="אמנון ותמר", neighborhood="ספיר",
         size_m2=120, rooms=5.0, floor=2, property_type="דירה",
         description="דירת 5 חדרים במודיעין. שכונת ספיר, קרובה לפארק.",
         contact_phone="052-1000038", images=imgs("modin1","modin2","modin3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-039",
         price=7500, city="מודיעין", street="ים התיכון", neighborhood="עצמה",
         size_m2=115, rooms=4.5, floor=3, property_type="שכירות",
         description="דירת 4.5 חדרים חדשה במודיעין. מטבח אמריקאי, חניה.",
         contact_phone="052-1000039", images=imgs("modin4","modin5"), is_active=True),

    # ── Kfar Saba ─────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-040",
         price=2900000, city="כפר סבא", street="ויצמן", neighborhood="מרכז",
         size_m2=110, rooms=4.0, floor=5, property_type="דירה",
         description="דירת 4 חדרים בכפר סבא. שיפוץ יוקרתי, מעלית.",
         contact_phone="052-1000040", images=imgs("ks1","ks2","ks3"), is_active=True),

    # ── Givatayim ─────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-041",
         price=3700000, city="גבעתיים", street="קוסובסקי", neighborhood="מרכז",
         size_m2=100, rooms=4.0, floor=3, property_type="דירה",
         description="דירת 4 חדרים בגבעתיים. שכונה יוקרתית, קרובה לתל אביב.",
         contact_phone="052-1000041", images=imgs("giv1","giv2","giv3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-042",
         price=8500, city="גבעתיים", street="בורוכוב", neighborhood="מרכז",
         size_m2=95, rooms=4.0, floor=2, property_type="שכירות",
         description="דירת 4 חדרים בגבעתיים. שיפוץ מלא, מרפסת.",
         contact_phone="052-1000042", images=imgs("giv4","giv5"), is_active=True),

    # ── Rehovot ───────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-043",
         price=2300000, city="רחובות", street="הרצל", neighborhood="מרכז",
         size_m2=90, rooms=3.5, floor=3, property_type="דירה",
         description="דירת 3.5 חדרים ברחובות. שכונת מגורים שקטה.",
         contact_phone="052-1000043", images=imgs("rehov1","rehov2","rehov3"), is_active=True),

    # ── Bat Yam ───────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-044",
         price=1900000, city="בת ים", street="בן גוריון", neighborhood="מרכז",
         size_m2=80, rooms=3.0, floor=4, property_type="דירה",
         description="דירת 3 חדרים בבת ים. קרובה לים, מרפסת עם נוף.",
         contact_phone="052-1000044", images=imgs("baty1","baty2","baty3"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-045",
         price=4800, city="בת ים", street="ירושלים", neighborhood="מרכז",
         size_m2=65, rooms=2.5, floor=2, property_type="שכירות",
         description="דירת 2.5 חדרים בבת ים להשכרה. קרובה לרכבת.",
         contact_phone="052-1000045", images=imgs("baty4","baty5"), is_active=True),

    # ── Nahariya ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-046",
         price=1500000, city="נהריה", street="הגעתון", neighborhood="מרכז",
         size_m2=85, rooms=3.5, floor=2, property_type="דירה",
         description="דירת 3.5 חדרים בנהריה. קרובה לחוף ולמרכז.",
         contact_phone="052-1000046", images=imgs("nah1","nah2","nah3"), is_active=True),

    # ── Tiberias ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-047",
         price=1200000, city="טבריה", street="הגליל", neighborhood="מרכז",
         size_m2=90, rooms=4.0, floor=3, property_type="דירה",
         description="דירת 4 חדרים בטבריה עם נוף לכנרת. מרפסת גדולה.",
         contact_phone="052-1000047", images=imgs("tib1","tib2","tib3"), is_active=True),

    # ── Ashkelon ──────────────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-048",
         price=1750000, city="אשקלון", street="דלילה", neighborhood="מרכז",
         size_m2=95, rooms=4.0, floor=2, property_type="דירה",
         description="דירת 4 חדרים באשקלון. גינה פרטית, חניה.",
         contact_phone="052-1000048", images=imgs("ask1","ask2","ask3"), is_active=True),

    # ── Tel Aviv premium ──────────────────────────────────────────────────────
    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-049",
         price=12000000, city="תל אביב", street="הירקון", neighborhood="צפון תל אביב",
         size_m2=280, rooms=7.0, floor=18, property_type="פנטהאוז",
         description="וילה על גג - 280 מ\"ר, 3 חניות, נוף 360 מעלות לים.",
         contact_phone="052-1000049", images=imgs("luxe1","luxe2","luxe3","luxe4","luxe5"), is_active=True),

    dict(source="yad2", source_url="https://www.yad2.co.il/item/seed-050",
         price=15000, city="תל אביב", street="יהודה המכבי", neighborhood="הצפון הישן",
         size_m2=160, rooms=5.0, floor=3, property_type="שכירות",
         description="דירת 5 חדרים יוקרתית להשכרה. עיצוב אדריכלי, מרפסת ענקית.",
         contact_phone="052-1000050", images=imgs("luxe6","luxe7","luxe8"), is_active=True),
]


def seed():
    print(f"Seeding {len(LISTINGS)} listings...")
    inserted = 0
    skipped = 0
    errors = 0

    for listing in LISTINGS:
        # Check if already exists
        r = httpx.get(
            f"{REST_URL}/listings",
            headers={**HEADERS, "Prefer": ""},
            params={"select": "id", "source_url": f"eq.{listing['source_url']}"},
            timeout=10,
        )
        if r.json():
            print(f"  Skipping (exists): {listing['city']} | {listing['price']}")
            skipped += 1
            continue
        try:
            r = httpx.post(
                f"{REST_URL}/listings",
                headers=HEADERS,
                content=json.dumps(listing),
                timeout=10,
            )
            if r.status_code in (200, 201):
                print(f"  Inserted: {listing['city']} | {listing['price']} | {listing['rooms']}R | {listing['size_m2']}m2")
                inserted += 1
            else:
                print(f"  ERROR {r.status_code}: {r.text[:150]}")
                errors += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            errors += 1

    print(f"\nDone: {inserted} inserted, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    seed()
