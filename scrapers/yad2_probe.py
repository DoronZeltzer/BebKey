"""
Yad2 API Probe v6 - inspect the map API and pagination structure.
The map endpoint returns 500k+ chars - let's see if it's full listing data.
"""

import asyncio, json, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

TARGET = "https://www.yad2.co.il/realestate/forsale?topArea=2&area=1&city=5000"

async def main():
    map_bodies = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="he-IL",
            extra_http_headers={"Accept-Language": "he-IL,he;q=0.9"},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)

        async def handle_response(response):
            url = response.url
            if "realestate-feed/forsale/map" in url:
                try:
                    body = await response.json()
                    map_bodies.append({"url": url, "body": body})
                    print(f"[MAP] {url[:100]}")
                except Exception as e:
                    print(f"[MAP ERROR] {e}")

        page.on("response", handle_response)

        await page.goto(TARGET, timeout=60000, wait_until="networkidle")
        print(f"Title: {await page.title()}")
        await asyncio.sleep(3)

        # Also check next page URL format
        print("\n--- Checking pagination links...")
        page_links = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href*="page="]'))
                .map(a => a.href).slice(0, 5)
        }""")
        for l in page_links:
            print(f"  {l}")

        # Also check what API calls happen on page 2
        print("\n--- Navigating to page 2...")
        captured_p2 = []
        async def handle_p2(response):
            url = response.url
            ct = response.headers.get("content-type","")
            if "json" in ct and "yad2.co.il" in url and "feed" in url.lower():
                try:
                    body = await response.json()
                    bs = json.dumps(body)
                    if len(bs) > 1000:
                        captured_p2.append({"url": url, "size": len(bs), "body": body})
                        print(f"  [P2 API] {len(bs):,} chars | {url[:100]}")
                except: pass
        page.on("response", handle_p2)
        await page.goto(TARGET + "&page=2", timeout=60000, wait_until="networkidle")
        await asyncio.sleep(3)
        print(f"  Page 2 title: {await page.title()}")

        # Extract __NEXT_DATA__ from page 2
        next_raw = await page.evaluate("() => document.getElementById('__NEXT_DATA__')?.textContent")
        if next_raw:
            nd = json.loads(next_raw)
            pp = nd.get("props",{}).get("pageProps",{})
            feed = pp.get("feed",{})
            if isinstance(feed, dict):
                private_count  = len(feed.get("private",[]))
                agency_count   = len(feed.get("agency",[]))
                print(f"\n  Page 2 feed: private={private_count}, agency={agency_count}")
                if feed.get("private"):
                    first = feed["private"][0]
                    print(f"  First private listing: {first.get('token')} | {first.get('price')} | {first.get('address',{}).get('city',{}).get('text')}")

        await browser.close()

    # ── Analyze map API responses ─────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"MAP API: {len(map_bodies)} responses captured")
    for mb in map_bodies[:2]:
        body = mb["body"]
        print(f"\nURL: {mb['url'][:100]}")
        if isinstance(body, dict):
            print(f"Keys: {list(body.keys())}")
            for key in ("data","feed","items","listings","results","markers"):
                if key not in body: continue
                val = body[key]
                if isinstance(val, list):
                    print(f"[{key}] → list of {len(val)}")
                    first = val[0] if val else None
                    if isinstance(first, dict):
                        print(f"  First item keys: {list(first.keys())}")
                        for k, v in list(first.items())[:15]:
                            print(f"    {k}: {str(v)[:100]}")
                elif isinstance(val, dict):
                    print(f"[{key}] → dict keys: {list(val.keys())[:12]}")
                    # check sub-lists
                    for sk, sv in list(val.items())[:5]:
                        if isinstance(sv, list) and sv:
                            print(f"  [{sk}] list of {len(sv)}, first keys: {list(sv[0].keys()) if isinstance(sv[0],dict) else '?'}")
        elif isinstance(body, list):
            print(f"Array of {len(body)}")
            if body and isinstance(body[0], dict):
                print(f"First keys: {list(body[0].keys())}")

asyncio.run(main())
