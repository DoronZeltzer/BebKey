"""
backfill_city_canonical.py — one-shot cleanup of the listings.city column.

The dropdown / landing pages come from get_distinct_cities(), which distincts on
the raw listings.city string. Scrapers wrote the same city under several spellings
(Telegram "תל אביב" vs Yad2 "תל אביב יפו"; OnMap Latin transliterations like
"Nahariyya"; "קריית"/"קרית" yod variants) and OnMap leaked foreign cities
(Dubai, Alanya, …). This script:

  • MERGEs variant spellings into one canonical name (Yad2's spelling, since
    Yad2 is ~83% of inventory and uses the official municipal names).
  • DEACTIVATEs foreign (non-Israeli) cities — is_active=false, NOT deleted, so
    it is fully reversible.

Safe by default: runs as a DRY RUN and only reports. Pass --apply to write.
Before applying it snapshots every affected row's (id, city, is_active) to a
timestamped JSON so the change can be rolled back.

Usage:
  python scrapers/backfill_city_canonical.py            # dry run (no writes)
  python scrapers/backfill_city_canonical.py --apply    # apply + write rollback file
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> dict:
    env = {}
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v.strip()
    # GitHub Actions / shell env wins if present
    for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"):
        if os.getenv(k):
            env[k] = os.getenv(k)
    return env


ENV = load_env()
URL = ENV["VITE_SUPABASE_URL"].rstrip("/")
READ_KEY = ENV.get("VITE_SUPABASE_ANON_KEY") or ENV["SUPABASE_SERVICE_ROLE_KEY"]
WRITE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

# ── Foreign (non-Israeli) cities to deactivate ──────────────────────────────
FOREIGN = ["Dubai", "Alanya", "Oba", "Limonta", "Kotelniki", "Moskva", "Sanremo", "Odesa"]

# ── variant spelling → canonical (Yad2/official) name ───────────────────────
MERGE = {
    # Telegram / Latin variants of Tel Aviv
    "תל אביב": "תל אביב יפו",
    "TLV": "תל אביב יפו",
    "Tel Aviv-Jaffa": "תל אביב יפו",
    # Latin transliterations whose Hebrew canonical already exists
    "Nahariyya": "נהריה",
    "Jerusalem": "ירושלים",
    "Ness Ziona": "נס ציונה",
    "Kefar Sava": "כפר סבא",
    "Zfat": "צפת",
    "Tsefat": "צפת",
    "Gan Yavne": "גן יבנה",
    "Kiryat Ekron": "קרית עקרון",
    "Azor": "אזור",
    "Rishon": "ראשון לציון",
    "Bet Shemesh": "בית שמש",
    "Ramat Beit Shemesh": "בית שמש",
    "Ari'el": "אריאל",
    "Gedera": "גדרה",
    "Modi'in-Maccabim-Re'ut": "מודיעין מכבים רעות",
    "Giv'at Ze'ev": "גבעת זאב",
    "Isfiya": "עספיא",
    "Giv'at Shmu'el": "גבעת שמואל",
    "Giv'at Shmuel": "גבעת שמואל",
    "Yokne'am Illit": "יקנעם עילית",
    "Pardes Hana-Karkur": "פרדס חנה כרכור",
    "Pardes Hanna-Karkur": "פרדס חנה כרכור",
    "Migdal": "מגדל",
    "Havatselet HaSharon": "חבצלת השרון",
    "Rekhasim": "רכסים",
    "Yanuv": "ינוב",
    "Kiryat Motskin": "קרית מוצקין",
    "Yehud-Monosson": "יהוד מונוסון",
    "Olesh": "עולש",
    "Zufim": "צופים",
    "Rosh Pinna": "ראש פינה",
    "Pardesia": "פרדסיה",
    "Shani-Livne": "שני ליבנה",
    "Hashmonaim": "חשמונאים",
    "Hogla": "חגלה",
    "Maale Adumim": "מעלה אדומים",
    "Neta'im": "נטעים",
    "Shilo": "שילה",
    "Eli": "עלי",
    "Neve Ziv": "נווה זיו",
    "Bnei Ayish": 'בני עי"ש',
    # Latin-only real cities with no Hebrew row yet (adds the missing city)
    "Metula": "מטולה",
    "Yad Binyamin": "יד בנימין",
    # OnMap Latin city strings → Hebrew canonical (so they dedupe + translate
    # in every UI; they previously displayed Latin even in the Hebrew UI).
    "Arsuf": "ארסוף",
    "Be'er Ganim": "באר גנים",
    "Carmit": "כרמית",
    "Ge'a": "גאה",
    "Meitar": "מיתר",
    "Ramot Menashe": "רמות מנשה",
    "Shtulim": "שתולים",
    "Ya'ara": "יערה",
    # Hebrew "קריית" → "קרית" (Yad2 spelling) yod-variants
    "קריית אונו": "קרית אונו",
    "קריית מוצקין": "קרית מוצקין",
    "קריית אתא": "קרית אתא",
    "קריית ים": "קרית ים",
    "קריית גת": "קרית גת",
    "קריית ביאליק": "קרית ביאליק",
    "קריית מלאכי": "קרית מלאכי",
    "קריית שמונה": "קרית שמונה",
    # Hebrew hyphen / spacing / apostrophe variants
    "מעלות-תרשיחא": "מעלות תרשיחא",
    "בנימינה-גבעת עדה": "בנימינה גבעת עדה",
    "נוף הגליל": "נצרת עילית / נוף הגליל",
    "דגניה א’": "דגניה א'",
}


def _req(method: str, path: str, key: str, body: bytes | None = None, prefer: str | None = None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=headers, method=method, data=body)
    return urllib.request.urlopen(req, timeout=60)


def count_active(city: str) -> int:
    q = f"listings?select=id&is_active=eq.true&city=eq.{urllib.parse.quote(city, safe='')}"
    with _req("GET", q, READ_KEY, prefer="count=exact") as r:
        cr = r.headers.get("content-range", "*/0")
    return int(cr.split("/")[-1]) if "/" in cr else 0


def snapshot(cities: list[str]) -> list[dict]:
    rows = []
    for c in cities:
        q = f"listings?select=id,city,is_active&city=eq.{urllib.parse.quote(c, safe='')}"
        with _req("GET", q, WRITE_KEY) as r:
            rows += json.loads(r.read().decode())
    return rows


def apply_merge(variant: str, canonical: str) -> None:
    body = json.dumps({"city": canonical}).encode()
    q = f"listings?city=eq.{urllib.parse.quote(variant, safe='')}"
    _req("PATCH", q, WRITE_KEY, body=body, prefer="return=minimal").close()


def apply_deactivate(city: str) -> None:
    body = json.dumps({"is_active": False}).encode()
    q = f"listings?city=eq.{urllib.parse.quote(city, safe='')}"
    _req("PATCH", q, WRITE_KEY, body=body, prefer="return=minimal").close()


def main() -> None:
    apply = "--apply" in sys.argv
    print(f"=== city canonical backfill ({'APPLY' if apply else 'DRY RUN'}) ===")

    merge_rows = 0
    merge_plan = []
    for variant, canonical in MERGE.items():
        n = count_active(variant)
        if n:
            merge_rows += n
            merge_plan.append((variant, canonical, n, count_active(canonical)))

    foreign_rows = 0
    foreign_plan = []
    for c in FOREIGN:
        n = count_active(c)
        foreign_rows += n
        foreign_plan.append((c, n))

    # UTF-8 report (Hebrew-safe) for review
    report = ROOT / "scrapers" / "_city_backfill_preview.txt"
    with report.open("w", encoding="utf-8") as f:
        f.write("MERGES (variant -> canonical | variant_count -> existing_canonical_count)\n")
        for v, c, n, m in sorted(merge_plan, key=lambda t: -t[2]):
            f.write(f"  {v}  ->  {c}   ({n} -> {m})\n")
        f.write("\nFOREIGN (deactivate)\n")
        for c, n in foreign_plan:
            f.write(f"  {c}: {n}\n")

    print(f"merges that match data: {len(merge_plan)} variants, {merge_rows} listings")
    print(f"foreign to deactivate:  {len([1 for _, n in foreign_plan if n])} cities, {foreign_rows} listings")
    print(f"full Hebrew-safe preview written to: {report}")

    if not apply:
        print("\nDRY RUN — no writes. Re-run with --apply to execute.")
        return

    # Snapshot for rollback
    snap_cities = [v for v, _, _, _ in merge_plan] + [c for c, n in foreign_plan if n]
    snap = snapshot(snap_cities)
    rollback = ROOT / "scrapers" / "_city_backfill_rollback.json"
    rollback.write_text(json.dumps(snap, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"\nrollback snapshot ({len(snap)} rows) -> {rollback}")

    for v, c, _, _ in merge_plan:
        apply_merge(v, c)
    for c, n in foreign_plan:
        if n:
            apply_deactivate(c)
    print(f"APPLIED: merged {len(merge_plan)} variants, deactivated {foreign_rows} foreign listings.")


if __name__ == "__main__":
    main()
