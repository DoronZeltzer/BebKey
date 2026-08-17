"""
build_israel_cities.py — expand scrapers/israel_cities.py to ALL Israeli localities.

Source of truth for the locality list: data.gov.il CBS "רשימת ישובים בישראל"
(~1,306 localities — every city, moshav, kibbutz, Arab village, settlement).
For each locality we resolve its Yad2 city_id + region_id via the Yad2
address-autocomplete API (verified earlier to match the realestate-feed map
endpoint's region/city params). Localities Yad2 doesn't list keep yad2_city_id=0
(still covered by the region sweep + matched by name in the text scrapers).

Safety: the existing curated/verified entries in israel_cities.py are kept
EXACTLY as-is (their English transliterations + already-verified IDs); we only
ADD the localities that aren't already present. Run standalone:

    python scripts/build_israel_cities.py
"""
from __future__ import annotations
import json, sys, time, urllib.request, urllib.parse, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICP = ROOT / "scrapers" / "israel_cities.py"
CBS_RID = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba"
AC = "https://gw.yad2.co.il/address-autocomplete/realestate/v2?text="
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/131.0 Safari/537.36",
     "Accept": "application/json", "Accept-Language": "he-IL,he;q=0.9",
     "Referer": "https://www.yad2.co.il/"}


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("‏", "").strip())


def fetch_cbs() -> list[dict]:
    u = f"https://data.gov.il/api/3/action/datastore_search?resource_id={CBS_RID}&limit=2000"
    with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r:
        d = json.loads(r.read().decode("utf-8", "replace"))
    return d["result"]["records"]


def yad2_lookup(name: str, tries: int = 3):
    """Return (city_id, region_id) or (0, 0)."""
    for attempt in range(tries):
        try:
            u = AC + urllib.parse.quote(name)
            with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=20) as r:
                d = json.loads(r.read().decode("utf-8", "replace"))
            cities = d.get("cities", [])
            m = next((c for c in cities if clean(c.get("fullTitleText", "")) == name), None) \
                or (cities[0] if cities else None)
            if not m:
                return 0, 0
            cid = str(m.get("cityId", "")); rid = str(m.get("regionId", ""))
            return (int(cid) if cid.isdigit() else 0, int(rid) if rid.isdigit() else 0)
        except Exception:
            time.sleep(1.0 + attempt)
    return 0, 0


def load_existing_block() -> tuple[str, str, str, list[str]]:
    text = ICP.read_text(encoding="utf-8")
    head, sep, rest = text.partition("ALL_CITIES: list[City] = [\n")
    body, sep2, tail = rest.partition("\n]\n")
    # crude: collect existing hebrew names already in the file to avoid dupes
    existing_heb = set(re.findall(r'City\(\s*"([^"]+)"', body) + re.findall(r"City\(\s*'([^']+)'", body))
    return head + sep, body, "\n]\n" + tail, list(existing_heb)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    prefix, existing_body, suffix, existing_heb = load_existing_block()
    existing = {clean(h) for h in existing_heb}
    print(f"existing entries in israel_cities.py: {len(existing)}")

    records = fetch_cbs()
    print(f"CBS localities fetched: {len(records)}")

    new_lines = []
    resolved = 0
    new_total = 0
    for i, rec in enumerate(records):
        heb = clean(rec.get("שם_ישוב", ""))
        if not heb or heb in existing:
            continue
        # skip non-locality artifacts
        if heb in ("לא רשום", "ללא"):
            continue
        lat = clean(rec.get("שם_ישוב_לועזי", ""))
        eng = lat.title() if lat else heb
        cid, rid = yad2_lookup(heb)
        if cid:
            resolved += 1
        hj = json.dumps(heb, ensure_ascii=False)
        ej = json.dumps(eng, ensure_ascii=False)
        new_lines.append(f"    City({hj}, {ej}, {cid}, 0, {rid}),")
        new_total += 1
        existing.add(heb)
        time.sleep(0.22)
        if (i + 1) % 100 == 0:
            print(f"  …{i+1}/{len(records)} processed, {new_total} new, {resolved} with Yad2 id")

    addition = ("\n    # ── Full CBS locality list (data.gov.il) — appended "
                f"{new_total} localities; Yad2 IDs resolved via autocomplete ──\n"
                + "\n".join(new_lines) + "\n")
    new_text = prefix + existing_body + addition + suffix
    ICP.write_text(new_text, encoding="utf-8")
    print(f"\nDONE: added {new_total} localities ({resolved} with a Yad2 city_id). "
          f"Wrote {ICP}")


if __name__ == "__main__":
    main()
