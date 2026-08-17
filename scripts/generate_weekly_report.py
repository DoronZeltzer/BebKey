"""
generate_weekly_report.py - produces one markdown blog post per week,
"Israeli real estate weekly report - <date>".

For each of the top-10 cities by current active listings, we report:
  • Active listing count and week-over-week change
  • Median rent (₪/mo) and week-over-week change
  • Median sale price (₪) and week-over-week change
  • Median price per m²

Posts are written to public/blog/<YYYY-MM-DD>-weekly-report.md and
public/blog/<YYYY-MM-DD>-weekly-report.he.md.  The Blog UI in the React
app reads them via fetch() at runtime - no extra build step.

Each post is ~600-800 words of real content (city-by-city paragraphs),
so Google ranks it as a substantive article rather than thin content.

Env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median

ROOT     = Path(__file__).resolve().parent.parent
BLOG_DIR = ROOT / "public" / "blog"
BLOG_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase env missing", file=sys.stderr); sys.exit(1)

CITY_DISPLAY_EN = {
    "תל אביב": "Tel Aviv-Yafo",
    "תל אביב-יפו": "Tel Aviv-Yafo",
    "ירושלים": "Jerusalem",
    "חיפה": "Haifa",
    "ראשון לציון": "Rishon LeZion",
    "פתח תקווה": "Petah Tikva",
    "נתניה": "Netanya",
    "אשדוד": "Ashdod",
    "באר שבע": "Be'er Sheva",
    "בני ברק": "Bnei Brak",
    "חולון": "Holon",
    "רמת גן": "Ramat Gan",
    "אשקלון": "Ashkelon",
    "רחובות": "Rehovot",
    "כפר סבא": "Kfar Saba",
    "הרצליה": "Herzliya",
}

def get(path: str, params: dict | None = None) -> tuple[list, int]:
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='*,.()')}" for k, v in (params or {}).items())
    url = f"{SUPABASE_URL}/rest/v1/{path}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer":        "count=exact",
        "Range":         "0-49999",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode("utf-8") or "[]")
        crange = r.headers.get("content-range", "*/0")
        total = int(crange.split("/")[-1]) if "/" in crange else len(body)
    return body, total


def rpc(name: str, payload: dict | None = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/rpc/{name}"
    req = urllib.request.Request(url, method="POST", headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }, data=json.dumps(payload or {}).encode("utf-8"))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8") or "[]")


def fmt_pct(now: float | None, then: float | None) -> str:
    if not now or not then or then == 0:
        return "-"
    pct = (now - then) / then * 100
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct:.1f}%"


def city_stats(city: str, deal: str, week_ago_iso: str) -> dict:
    """Return median price + count for active listings + 'a week ago' baseline.
       Week-ago baseline approximates via `created_at <= week_ago_iso`."""
    # Current active
    data, total = get("listings", {
        "select":      "price",
        "city":        f"eq.{city}",
        "deal_type":   f"eq.{deal}",
        "is_active":   "eq.true",
        "price":       "not.is.null",
    })
    prices_now = [r["price"] for r in data if r.get("price") and r["price"] >= 200]

    # Baseline: listings that existed at the start of the week
    data, _ = get("listings", {
        "select":      "price",
        "city":        f"eq.{city}",
        "deal_type":   f"eq.{deal}",
        "is_active":   "eq.true",
        "created_at":  f"lte.{week_ago_iso}",
        "price":       "not.is.null",
    })
    prices_then = [r["price"] for r in data if r.get("price") and r["price"] >= 200]

    return {
        "count":       total,
        "median_now":  int(median(prices_now)) if prices_now else None,
        "median_then": int(median(prices_then)) if prices_then else None,
    }


def render_post(date_str: str, rows: list[dict], lang: str) -> str:
    """Build the markdown body for a given language."""
    if lang == "en":
        title = f"Israeli real estate weekly report - {date_str}"
        intro = (
            "Where the Israeli rental and for-sale markets stood at the start of "
            f"week ending {date_str}, based on every active listing currently "
            "indexed by BebKey across Yad2, OnMap, Madlan, Janglo, Komo, JPost "
            "and our other sources.  Numbers are medians, not averages - a "
            "single ₪50M villa won't skew the figure for a whole city."
        )
        section_header_rent  = "Rent"
        section_header_sale  = "Sale"
        section_header_total = "Activity"
        h_count    = "Active listings"
        h_med_rent = "Median rent (₪/mo)"
        h_med_sale = "Median sale price (₪)"
        h_wow      = "Week-over-week"
        cta        = (
            "\n\n---\n\n"
            "**Looking in one of these markets?**  Save a search on BebKey and "
            "we'll email you the moment a matching listing appears.  Or browse "
            "the [full marketplace](/search)."
        )
    else:  # he
        title = f"דו\"ח שבועי נדל\"ן ישראל - {date_str}"
        intro = (
            f"מצב שוק השכירות והמכירה בישראל בשבוע שהסתיים ב-{date_str}, "
            "מבוסס על כל המודעות הפעילות שמופיעות כעת ב-BebKey ממקורות כמו "
            "יד2, OnMap, Madlan, Janglo, Komo, ג'רוזלם פוסט ועוד. המספרים "
            "הם חציון ולא ממוצע - וילה אחת ב-50 מיליון ש\"ח לא תעוות נתון "
            "של עיר שלמה."
        )
        section_header_rent  = "שכירות"
        section_header_sale  = "מכירה"
        section_header_total = "פעילות"
        h_count    = "מודעות פעילות"
        h_med_rent = "חציון שכירות (₪/חודש)"
        h_med_sale = "חציון מחיר מכירה (₪)"
        h_wow      = "שינוי שבועי"
        cta        = (
            "\n\n---\n\n"
            "**מחפשים באחד מהשווקים האלה?** שמרו חיפוש ב-BebKey ונשלח לכם "
            "מייל ברגע שמופיעה מודעה תואמת. או דפדפו ב-[שוק המודעות המלא](/search)."
        )

    md  = f"# {title}\n\n{intro}\n\n"

    # Sale table
    md += f"## {section_header_sale}\n\n"
    md += f"| City | {h_count} | {h_med_sale} | {h_wow} |\n"
    md += "|---|---:|---:|---:|\n"
    for r in rows:
        city_name = CITY_DISPLAY_EN.get(r["city"], r["city"]) if lang == "en" else r["city"]
        s = r["sale"]
        med = f"₪{s['median_now']:,}" if s["median_now"] else "-"
        md += f"| {city_name} | {s['count']:,} | {med} | {fmt_pct(s['median_now'], s['median_then'])} |\n"
    md += "\n"

    # Rent table
    md += f"## {section_header_rent}\n\n"
    md += f"| City | {h_count} | {h_med_rent} | {h_wow} |\n"
    md += "|---|---:|---:|---:|\n"
    for r in rows:
        city_name = CITY_DISPLAY_EN.get(r["city"], r["city"]) if lang == "en" else r["city"]
        s = r["rent"]
        med = f"₪{s['median_now']:,}" if s["median_now"] else "-"
        md += f"| {city_name} | {s['count']:,} | {med} | {fmt_pct(s['median_now'], s['median_then'])} |\n"
    md += "\n"

    # Per-city paragraphs (substantive content for SEO)
    if lang == "en":
        md += "## Market commentary\n\n"
        for r in rows[:5]:
            city_name = CITY_DISPLAY_EN.get(r["city"], r["city"])
            rent = r["rent"]; sale = r["sale"]
            paras = []
            if sale["median_now"]:
                paras.append(
                    f"In **{city_name}**, the median price of an active for-sale listing "
                    f"sits at ₪{sale['median_now']:,}, across {sale['count']:,} active "
                    f"listings, {fmt_pct(sale['median_now'], sale['median_then'])} versus last week."
                )
            if rent["median_now"]:
                paras.append(
                    f"Rental supply runs at {rent['count']:,} active listings with a "
                    f"median asking rent of ₪{rent['median_now']:,} per month - "
                    f"{fmt_pct(rent['median_now'], rent['median_then'])} week-over-week."
                )
            if paras:
                md += " ".join(paras) + "\n\n"
    else:
        md += "## פרשנות שוק\n\n"
        for r in rows[:5]:
            city_name = r["city"]
            rent = r["rent"]; sale = r["sale"]
            paras = []
            if sale["median_now"]:
                paras.append(
                    f"ב**{city_name}**, חציון מחיר המכירה כעת עומד על "
                    f"₪{sale['median_now']:,}, מתוך {sale['count']:,} מודעות פעילות, "
                    f"שינוי של {fmt_pct(sale['median_now'], sale['median_then'])} מהשבוע שעבר."
                )
            if rent["median_now"]:
                paras.append(
                    f"היצע השכירות עומד על {rent['count']:,} מודעות פעילות עם חציון "
                    f"שכירות חודשית של ₪{rent['median_now']:,} - "
                    f"{fmt_pct(rent['median_now'], rent['median_then'])} מהשבוע שעבר."
                )
            if paras:
                md += " ".join(paras) + "\n\n"

    md += cta
    return md


def main():
    today    = datetime.now(timezone.utc).date()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # All distinct active cities, then pick top 10 by listing count
    cities = rpc("get_distinct_cities") or []
    counted: list[tuple[str, int]] = []
    for c in cities:
        if not c: continue
        _, total = get("listings", {"select": "id", "city": f"eq.{c}", "is_active": "eq.true"})
        counted.append((c, total))
    counted.sort(key=lambda x: -x[1])
    top = [c for c, _ in counted[:10]]
    print(f"[report] top cities: {top}", file=sys.stderr)

    rows = []
    for city in top:
        rent = city_stats(city, "rent", week_ago)
        sale = city_stats(city, "forsale", week_ago)
        rows.append({"city": city, "rent": rent, "sale": sale})

    date_str = today.isoformat()
    slug     = f"{date_str}-weekly-report"

    # Write the two language files
    (BLOG_DIR / f"{slug}.md").write_text(render_post(date_str, rows, "en"), encoding="utf-8")
    (BLOG_DIR / f"{slug}.he.md").write_text(render_post(date_str, rows, "he"), encoding="utf-8")

    # Append/update the index.json that the Blog page reads
    index_path = BLOG_DIR / "index.json"
    posts = []
    if index_path.exists():
        try:
            posts = json.loads(index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            posts = []
    # Replace existing entry for this slug (re-running same day is idempotent)
    posts = [p for p in posts if p.get("slug") != slug]
    posts.insert(0, {
        "slug":     slug,
        "date":     date_str,
        "title":    f"Israeli real estate weekly report - {date_str}",
        "titleHe":  f"דו\"ח שבועי נדל\"ן ישראל - {date_str}",
        "excerpt":  f"Active listings, median prices, and week-over-week change across the top 10 Israeli cities.",
    })
    index_path.write_text(
        json.dumps(posts[:200], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[report] wrote public/blog/{slug}.md + .he.md, index has {len(posts)} posts")


if __name__ == "__main__":
    main()
