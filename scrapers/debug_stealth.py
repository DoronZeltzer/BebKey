"""
Test stealth mode on Yad2 to bypass ShieldSquare.
"""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright
from playwright_stealth import stealth, Stealth

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ]
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="he-IL",
            extra_http_headers={
                "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8",
            }
        )

        page = await ctx.new_page()
        await Stealth().apply_stealth_async(page)

        print("Visiting Yad2 with stealth mode...")
        await page.goto("https://www.yad2.co.il/realestate/forsale", timeout=30000, wait_until="domcontentloaded")
        await asyncio.sleep(5)

        title = await page.title()
        print(f"Title: {title}")

        # Check if blocked
        text = await page.evaluate("() => document.body.innerText?.slice(0, 300)")
        print(f"Body text: {text}")

        # Count listing links
        links = await page.evaluate("""() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'))
            return anchors.map(a => a.href).filter(h => h.includes('/item/') || h.includes('yad2')).slice(0, 10)
        }""")
        print(f"\nLinks: {links}")

        await browser.close()

asyncio.run(main())
