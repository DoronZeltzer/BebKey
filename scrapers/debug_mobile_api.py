"""
Test Yad2 mobile/gateway API endpoints with httpx.
"""
import asyncio
import httpx
import sys
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Mobile app headers
MOBILE_HEADERS = {
    "User-Agent": "Yad2/7.2.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    "Accept": "application/json",
    "Accept-Language": "he-IL",
    "x-app-name": "yad2",
    "x-app-version": "7.2.0",
}

WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9",
    "Referer": "https://www.yad2.co.il/realestate/forsale",
    "Origin": "https://www.yad2.co.il",
}

ENDPOINTS = [
    ("GET", "https://gw.yad2.co.il/realestate-feed/realestate/forsale?page=1&rows=5", WEB_HEADERS),
    ("GET", "https://gw.yad2.co.il/realestate-feed/realestate/rent?page=1&rows=5", WEB_HEADERS),
    ("GET", "https://gw.yad2.co.il/feed-search/realestate/forsale?page=1&rows=5", WEB_HEADERS),
    ("GET", "https://www.yad2.co.il/api/pre-load/getFeedIndex/realestate/forsale", WEB_HEADERS),
    ("GET", "https://m.yad2.co.il/api/pre-load/getFeedIndex/realestate/forsale", MOBILE_HEADERS),
    ("GET", "https://gw.yad2.co.il/realestate/forsale?page=1&rows=5&currPage=1", WEB_HEADERS),
]

async def main():
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for method, url, headers in ENDPOINTS:
            print(f"\n--- {method} {url}")
            try:
                resp = await client.get(url, headers=headers)
                print(f"Status: {resp.status_code}")
                body = resp.text[:400]
                print(f"Body: {body}")
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        print(f"JSON type: {type(data).__name__}, keys: {list(data.keys()) if isinstance(data, dict) else 'array'}")
                    except:
                        pass
            except Exception as e:
                print(f"Error: {e}")

asyncio.run(main())
