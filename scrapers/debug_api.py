"""
Test Yad2's internal JSON feed API endpoints.
"""
import asyncio
import json
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9",
    "Referer": "https://www.yad2.co.il/",
    "Origin": "https://www.yad2.co.il",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

APIS = [
    "https://gw.yad2.co.il/feed-search-legacy/realestate/forsale?page=1&rows=10",
    "https://gw.yad2.co.il/feed-search-legacy/realestate/rent?page=1&rows=10",
    "https://www.yad2.co.il/api/pre-load/getFeedIndex/realestate/forsale",
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="he-IL",
            extra_http_headers=HEADERS,
        )
        page = await ctx.new_page()

        # First visit the main site to get cookies
        print("Visiting main site to get cookies...")
        await page.goto("https://www.yad2.co.il/", timeout=30000)
        await asyncio.sleep(3)
        print(f"Main site title: {await page.title()}")

        for api_url in APIS:
            print(f"\n--- Testing: {api_url}")
            try:
                resp = await page.request.get(api_url, headers=HEADERS)
                status = resp.status
                body = await resp.text()
                print(f"Status: {status}")
                print(f"Body (first 500): {body[:500]}")
                if status == 200:
                    try:
                        data = json.loads(body)
                        print(f"JSON keys: {list(data.keys()) if isinstance(data, dict) else 'array'}")
                    except:
                        pass
            except Exception as e:
                print(f"Error: {e}")

        await browser.close()

asyncio.run(main())
