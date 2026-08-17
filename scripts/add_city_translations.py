"""Append translations for 54 small Israeli localities missing from cityNames.ts.

Run once after a DB sweep finds new untranslated cities.  The script appends
new entries to the existing CITIES_NAMES map; it does NOT touch existing
entries.  Safe to re-run - duplicates are skipped.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "src" / "lib" / "cityNames.ts"

# Standard transliterations matching the style already in cityNames.ts.
# Format: { he: (en, ru, ar, fr) }
NEW = {
    "אביאל":            ("Aviel",            "Авиэль",          "أفيئيل",            "Aviel"),
    "אביעזר":           ("Aviezer",          "Авиэзер",         "أفيعزر",            "Aviezer"),
    "אדרת":             ("Aderet",           "Адерет",          "أديريت",            "Aderet"),
    "אודים":            ("Udim",             "Удим",            "أوديم",             "Udim"),
    "אומץ":             ("Ometz",            "Омец",            "أوميتس",            "Ometz"),
    "אורה":             ("Ora",              "Ора",             "أورا",              "Ora"),
    "אושה":             ("Usha",             "Уша",             "أوشا",              "Usha"),
    "אחיהוד":           ("Ahihud",           "Ахихуд",          "أحيهود",            "Ahihud"),
    "אירוס":            ("Iris",             "Ирис",            "إيريس",             "Iris"),
    "אפק":              ("Afek",             "Афек",            "أفيك",              "Afek"),
    "ארסוף":            ("Arsuf",            "Арсуф",           "أرسوف",             "Arsuf"),
    "אשרת":             ("Asheret",          "Ашерет",          "أشيريت",            "Asheret"),
    "אשתאול":           ("Eshtaol",          "Эштаоль",         "إشتاؤول",           "Eshtaol"),
    "בית חרות":         ("Beit Herut",       "Бейт-Херут",      "بيت حيروت",         "Beit Herut"),
    "בית חשמונאי":      ("Beit Hashmonai",   "Бейт-Хашмонай",   "بيت حشمونائي",      "Beit Hashmonai"),
    "בית יצחק שער חפר": ("Beit Yitzhak-Sha'ar Hefer", "Бейт-Ицхак", "بيت يتسحاق",  "Beit Yitzhak"),
    "בית נקופה":        ("Beit Nekofa",      "Бейт-Некофа",     "بيت نقوفا",         "Beit Nekofa"),
    "בית עוזיאל":       ("Beit Uziel",       "Бейт-Узиэль",     "بيت عوزيئيل",       "Beit Uziel"),
    "בצרה":             ("Bazra",            "Бацра",           "بصرة",              "Bazra"),
    "בצת":              ("Betzet",           "Бецет",           "بيتسيت",            "Betzet"),
    "ג'סר א זרקא":      ("Jisr az-Zarqa",    "Джиср аз-Зарка",  "جسر الزرقاء",       "Jisr az-Zarqa"),
    "גבעת ח\"ן":        ("Givat Hen",        "Гиват-Хен",       "غيفعات حن",         "Givat Hen"),
    "גבעת יערים":       ("Givat Ye'arim",    "Гиват-Йеарим",    "غيفعات يعاريم",     "Givat Ye'arim"),
    "גת רימון":         ("Gat Rimon",        "Гат-Римон",       "غات ريمون",         "Gat Rimon"),
    "החותרים":          ("HaHoterim",        "ХаХотерим",       "هاحوتريم",          "HaHoterim"),
    "חופית":            ("Hofit",            "Хофит",           "حوفيت",             "Hofit"),
    "חרוצים":           ("Harutzim",         "Харуцим",         "حروتسيم",           "Harutzim"),
    "טירת יהודה":       ("Tirat Yehuda",     "Тират-Йехуда",    "طيرة يهودا",        "Tirat Yehuda"),
    "יגל":              ("Yagel",            "Ягель",           "ياغيل",             "Yagel"),
    "יד רמב\"ם":        ("Yad Rambam",       "Яд-Рамбам",       "ياد رمبام",         "Yad Rambam"),
    "יהוד מונוסון":     ("Yehud-Monosson",   "Йехуд-Моноссон",  "يهود-مونوسون",      "Yehud-Monosson"),
    "ינוב":             ("Yanuv",            "Янув",            "يانوف",             "Yanuv"),
    "יסעור":            ("Yas'ur",           "Ясур",            "ياسعور",            "Yas'ur"),
    "יעף":              ("Ya'af",            "Яаф",             "ياعاف",             "Ya'af"),
    "יקנעם (מושבה)":    ("Yokneam Moshava",  "Йокнеам-Мошава",  "يوكنعام موشافا",    "Yokneam Moshava"),
    "ישרש":             ("Yashresh",         "Яшреш",           "يشريش",             "Yashresh"),
    "כוכב יאיר / צור יגאל": ("Kokhav Yair-Tzur Yigal", "Кохав-Яир", "كوخاف يائير", "Kokhav Yair"),
    "כסלון":            ("Ksalon",           "Кесалон",         "كيسالون",           "Ksalon"),
    "כפר הנגיד":        ("Kfar HaNagid",     "Кфар-Ха-Нагид",   "كفار هنغيد",        "Kfar HaNagid"),
    "כפר הרא\"ה":       ("Kfar HaRoeh",      "Кфар-ХаРоэ",      "كفار هارواه",       "Kfar HaRoeh"),
    "כפר יעבץ":         ("Kfar Yavetz",      "Кфар-Явец",       "كفار يعبيتس",       "Kfar Yavetz"),
    "מוצא עילית":       ("Motza Illit",      "Моца-Илит",       "موتسا عيليت",       "Motza Illit"),
    "מכמורת":           ("Mikhmoret",        "Михморет",        "مخموريت",           "Mikhmoret"),
    "עולש":             ("Olesh",            "Олеш",            "عوليش",             "Olesh"),
    "פרדס חנה כרכור":   ("Pardes Hanna-Karkur", "Пардес-Ханна-Каркур", "برديس حنا-كركور", "Pardes Hanna-Karkur"),
    "צוקי ים":          ("Tzukei Yam",       "Цукей-Ям",        "تسوكي يام",         "Tzukei Yam"),
    "קדימה צורן":       ("Kadima-Tzoran",    "Кадима-Цоран",    "قاديما-تسوران",     "Kadima-Tzoran"),
    "קרית גת":          ("Kiryat Gat",       "Кирьят-Гат",      "كريات غات",         "Kiryat Gat"),
    "שדה ורבורג":       ("Sde Warburg",      "Сде-Варбург",     "سديه وربورغ",       "Sde Warburg"),
    "שושנת העמקים":     ("Shoshanat HaAmakim", "Шошанат-ха-Амаким", "شوشانات هعماكيم", "Shoshanat HaAmakim"),
    "שעלבים":           ("Sha'alvim",        "Шаалвим",         "شعلفيم",            "Sha'alvim"),
    "שער אפרים":        ("Sha'ar Efrayim",   "Шаар-Эфраим",     "شاعار إفرايم",      "Sha'ar Efrayim"),
    "שריגים":           ("Srigim",           "Сригим",          "سريغيم",            "Srigim"),
    "תלמי אלעזר":       ("Talmei Elazar",    "Талмей-Элазар",   "تلمي العزار",       "Talmei Elazar"),
}

def main():
    src = TARGET.read_text(encoding="utf-8")
    # Find the closing brace of the CITY_TRANSLATIONS map.  The signature is
    # "export const CITY_TRANSLATIONS: ... = {", so we scan for the next
    # top-level "}\n" after that declaration.
    decl_idx = src.find("export const CITY_TRANSLATIONS")
    if decl_idx == -1:
        print("! could not find `export const CITY_TRANSLATIONS`")
        return
    close_idx = src.find("\n}\n", decl_idx)
    if close_idx == -1:
        print("! could not find closing brace of CITY_TRANSLATIONS")
        return
    close_idx += 1  # point AT the closing `}` so we insert just before it
    inserted = 0
    skipped = 0
    new_lines = []
    for he, (en, ru, ar, fr) in NEW.items():
        # Detect duplicates (already added by hand)
        if f"'{he}'" in src:
            skipped += 1
            continue
        line = f"  '{he}': {{ en: \"{en}\", ru: \"{ru}\", ar: \"{ar}\", fr: \"{fr}\" }},\n"
        new_lines.append(line)
        inserted += 1
    if not new_lines:
        print(f"  nothing to insert (skipped {skipped} dup)")
        return
    patch = "  // ── Auto-appended by scripts/add_city_translations.py ────────────────────\n" + "".join(new_lines)
    src2 = src[:close_idx] + patch + src[close_idx:]
    TARGET.write_text(src2, encoding="utf-8")
    print(f"  inserted {inserted} new city translations -> {TARGET.name} (skipped {skipped} dups)")

if __name__ == "__main__":
    main()
