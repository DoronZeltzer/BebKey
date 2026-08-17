"""
audit_robots_txt.py - checks each BebKey scraper against the target site's
robots.txt.  Reports per-source:
  * Does the site have a robots.txt?
  * What's the policy for User-Agent: BebKeyBot (our identifier)?
  * What's the policy for User-Agent: * (the fallback)?
  * Is our scraping target path Allowed or Disallowed?
  * What's the Crawl-Delay (if any)?

Run locally:  python scripts/audit_robots_txt.py

Output is a markdown table that can be pasted into a Compliance section
of LAUNCH.md or sent to a lawyer for review.

Exit code 0 if all OK, 1 if any source has a Disallow on our target.
"""
from __future__ import annotations

import sys
import urllib.parse
from urllib.robotparser import RobotFileParser

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import httpx
except ImportError:
    print("ERROR: pip install httpx"); sys.exit(1)


# ── Sources BebKey scrapes ──────────────────────────────────────────────────
# Tuple: (source_name, robots_url, sample_paths_to_check)
SOURCES = [
    ("Yad2", "https://www.yad2.co.il/robots.txt", [
        "/realestate/forsale",
        "/realestate/rent",
        "/item/abc123",
        # API endpoint we hit via gw.yad2.co.il
        # (note: subdomain robots are separate; this is the main site)
    ]),
    ("Yad2 API", "https://gw.yad2.co.il/robots.txt", [
        "/realestate-feed/forsale/map",
        "/realestate-feed/rent/map",
    ]),
    ("OnMap", "https://www.onmap.co.il/robots.txt", [
        "/sitemap-sale-en.xml",
        "/sitemap-rent-en.xml",
        "/en/home-details/abc",
    ]),
    ("Madlan", "https://www.madlan.co.il/robots.txt", [
        "/",
        "/for-sale/תל-אביב-יפו-ישראל",
        "/for-rent/תל-אביב-יפו-ישראל",
    ]),
    ("Janglo", "https://www.janglo.net/robots.txt", [
        "/index.php",
        "/component/cobalt/category/real-estate",
    ]),
    ("Komo", "https://www.komo.co.il/robots.txt", [
        "/code/nadlan/apartments-for-sale.asp",
        "/code/nadlan/apartments-for-rent.asp",
    ]),
    ("JPost RE", "https://realestate.jpost.com/robots.txt", [
        "/estate_property/",
    ]),
    ("Homeless", "https://www.homeless.co.il/robots.txt", [
        "/rent",
        "/sale",
        "/forsale",
        "/rent/viewad,12345.aspx",
    ]),
]

OUR_UA = "BebKeyBot/1.0"
FALLBACK_UA = "*"


def fetch_robots(url: str) -> tuple[str, str | None]:
    """Returns (status, body).  status is 'ok', 'missing', or 'error: ...'."""
    try:
        r = httpx.get(url, timeout=10, follow_redirects=True,
                       headers={"User-Agent": f"{OUR_UA} (compliance audit)"})
    except Exception as e:
        return f"error: {e}", None
    if r.status_code == 200:
        return "ok", r.text
    if r.status_code == 404:
        return "missing", None
    return f"http {r.status_code}", None


def crawl_delay(robots_text: str, ua: str) -> int | None:
    """Extract Crawl-Delay for a User-Agent block.  urllib.RobotFileParser
    doesn't expose this directly so we parse it ourselves."""
    in_block = False
    for raw in robots_text.splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line:
            in_block = False
            continue
        if ':' not in line:
            continue
        k, _, v = (s.strip() for s in line.partition(':'))
        if k.lower() == 'user-agent':
            in_block = (v == '*' or ua.lower() in v.lower())
        elif in_block and k.lower() == 'crawl-delay':
            try: return int(v)
            except ValueError: return None
    return None


def audit_one(name: str, robots_url: str, paths: list[str]) -> tuple[str, list[str]]:
    """Returns (summary_line, list of warnings)."""
    status, body = fetch_robots(robots_url)
    warnings: list[str] = []

    if status == "missing":
        return (f"| {name:14} | ✅ no robots.txt - full access by default | - |", [])
    if status.startswith("error") or status.startswith("http"):
        warnings.append(f"{name}: failed to fetch robots.txt ({status})")
        return (f"| {name:14} | ⚠ {status} | - |", warnings)

    rp = RobotFileParser()
    rp.parse((body or "").splitlines())

    # Check each path under our UA and the fallback UA
    blocked: list[str] = []
    for p in paths:
        if not rp.can_fetch(OUR_UA, p) or not rp.can_fetch(FALLBACK_UA, p):
            blocked.append(p)
            warnings.append(f"{name}: {p} blocked by robots.txt")

    delay_ours = crawl_delay(body or "", OUR_UA)
    delay_star = crawl_delay(body or "", FALLBACK_UA)
    delay = delay_ours if delay_ours is not None else delay_star
    delay_str = f"{delay}s" if delay is not None else "-"

    if blocked:
        return (f"| {name:14} | ❌ {len(blocked)}/{len(paths)} paths blocked: {', '.join(blocked[:2])}{'...' if len(blocked)>2 else ''} | {delay_str} |", warnings)
    else:
        return (f"| {name:14} | ✅ all {len(paths)} paths allowed | {delay_str} |", [])


def main() -> None:
    print("# BebKey scraper robots.txt audit")
    print()
    print(f"Auditing {len(SOURCES)} sources with User-Agent: `{OUR_UA}`")
    print()
    print("| Source | Status | Crawl-Delay |")
    print("|---|---|---|")
    all_warnings: list[str] = []
    for name, url, paths in SOURCES:
        line, warns = audit_one(name, url, paths)
        print(line)
        all_warnings.extend(warns)

    print()
    if all_warnings:
        print("## ⚠ Warnings")
        print()
        for w in all_warnings:
            print(f"- {w}")
        sys.exit(1)
    else:
        print("## ✅ No violations detected.")
        print()
        print("All scraped paths are permitted by the respective robots.txt files")
        print(f"under our `{OUR_UA}` user-agent.")
        sys.exit(0)


if __name__ == "__main__":
    main()
