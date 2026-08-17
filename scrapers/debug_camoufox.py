"""
Test camoufox (anti-detect Firefox) on Yad2.
"""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from camoufox.async_api import AsyncCamoufox

async def main():
    async with AsyncCamoufox(headless=True, block_images=True) as browser:
        page = await browser.new_page()

        print("Visiting Yad2 with camoufox...")
        await page.goto("https://www.yad2.co.il/realestate/forsale", timeout=30000)
        await asyncio.sleep(5)

        title = await page.title()
        print(f"Title: {title}")

        text = await page.evaluate("() => document.body.innerText?.slice(0, 200)")
        print(f"Body: {text}")

        links = await page.evaluate("""() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/item/"]'))
            return [...new Set(anchors.map(a => a.href))].slice(0, 5)
        }""")
        print(f"\nItem links found: {len(links)}")
        for l in links:
            print(f"  {l}")

asyncio.run(main())
