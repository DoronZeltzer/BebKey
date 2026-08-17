"""
generate_rss.py - produce public/feed.xml combining:
  • Every blog post under public/blog/ (with its publication date)
  • The 50 newest active listings (so aggregators discover fresh content)

RSS feeds are still consumed by:
  • Feedly / Inoreader / NewsBlur (regular humans)
  • Aggregators (Israeli real-estate forums, Telegram bots)
  • Bing/Google news (occasionally pick up feed items as articles)

It's one more free distribution channel - set it and forget it.
"""
from __future__ import annotations

import html
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT     = Path(__file__).resolve().parent.parent
PUBLIC   = ROOT / "public"
BLOG_DIR = PUBLIC / "blog"
OUT      = PUBLIC / "feed.xml"
SITE     = "https://www.bebkey.com"

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def rfc822(d: datetime) -> str:
    return d.strftime("%a, %d %b %Y %H:%M:%S +0000")


def fetch_recent_listings(n: int = 50) -> list[dict]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    url = (
        f"{SUPABASE_URL}/rest/v1/listings"
        f"?select=id,price,city,rooms,size_m2,deal_type,created_at,description,images"
        f"&is_active=eq.true"
        f"&order=created_at.desc"
        f"&limit={n}"
    )
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8") or "[]")
    except Exception as e:
        print(f"[rss] listings fetch failed: {e}", file=sys.stderr)
        return []


def listing_item(l: dict) -> str:
    city  = l.get("city") or ""
    price = l.get("price")
    rooms = l.get("rooms")
    deal  = "Rental" if l.get("deal_type") == "rent" else "For sale"
    bits  = [deal, f"{rooms}-room" if rooms else None, city]
    title = " · ".join([b for b in bits if b]) or "Listing"
    if price:
        title = f"{title} - ₪{price:,}"

    desc = (l.get("description") or "").strip()[:280]
    pub  = l.get("created_at") or datetime.now(timezone.utc).isoformat()
    pubdate = rfc822(datetime.fromisoformat(pub.replace("Z", "+00:00")))
    return f"""    <item>
      <title>{html.escape(title)}</title>
      <link>{SITE}/listing/{l['id']}</link>
      <guid isPermaLink="true">{SITE}/listing/{l['id']}</guid>
      <pubDate>{pubdate}</pubDate>
      <description>{html.escape(desc)}</description>
    </item>"""


def blog_item(slug: str, title: str, date: str, excerpt: str) -> str:
    try:
        dt = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    except ValueError:
        dt = datetime.now(timezone.utc)
    return f"""    <item>
      <title>{html.escape(title)}</title>
      <link>{SITE}/blog/{slug}</link>
      <guid isPermaLink="true">{SITE}/blog/{slug}</guid>
      <pubDate>{rfc822(dt)}</pubDate>
      <description>{html.escape(excerpt)}</description>
      <category>Market reports</category>
    </item>"""


def main():
    BLOG_DIR.mkdir(parents=True, exist_ok=True)
    items: list[str] = []

    # 1. Blog posts from index.json
    idx = BLOG_DIR / "index.json"
    if idx.exists():
        try:
            posts = json.loads(idx.read_text(encoding="utf-8"))
            for p in posts[:30]:
                items.append(blog_item(p["slug"], p["title"], p["date"], p.get("excerpt", "")))
        except json.JSONDecodeError:
            pass

    # 2. Recent listings
    for l in fetch_recent_listings(50):
        items.append(listing_item(l))

    now = rfc822(datetime.now(timezone.utc))
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BebKey - Israeli Real Estate</title>
    <link>{SITE}/</link>
    <atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Latest listings and weekly market reports from BebKey, Israel's all-in-one real estate aggregator.</description>
    <language>he-IL</language>
    <lastBuildDate>{now}</lastBuildDate>
    <ttl>60</ttl>
{chr(10).join(items)}
  </channel>
</rss>
"""
    OUT.write_text(xml, encoding="utf-8")
    print(f"[rss] wrote {OUT} with {len(items)} items")


if __name__ == "__main__":
    main()
