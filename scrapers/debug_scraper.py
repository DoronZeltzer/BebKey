"""
Debug - opens one listing and dumps the HTML structure to understand selectors.
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
import yad2_scraper as s

TARGET_URL = None  # will be set from search results

async def debug():
    async with __import__('playwright').async_api.async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Step 1: get one listing URL
        ctx = await browser.new_context(
            user_agent=s.USER_AGENTS[0],
            viewport={"width": 1280, "height": 800},
            locale="he-IL",
        )
        page = await ctx.new_page()
        urls = await s.get_listing_urls(page, "https://www.yad2.co.il/realestate/forsale?page=1")
        await page.close()
        await ctx.close()

        if not urls:
            print("No URLs found!")
            await browser.close()
            return

        url = urls[0]
        print(f"\nDebugging: {url}\n")

        # Step 2: open listing and dump DOM info
        ctx2 = await browser.new_context(
            user_agent=s.USER_AGENTS[0],
            viewport={"width": 1280, "height": 800},
            locale="he-IL",
        )
        page2 = await ctx2.new_page()
        await page2.goto(url, timeout=30000)
        await asyncio.sleep(4)

        # Dump title + meta
        info = await page2.evaluate("""() => {
            const metas = Array.from(document.querySelectorAll('meta')).map(m => ({
                name: m.name || m.getAttribute('property') || '',
                content: m.getAttribute('content') || ''
            })).filter(m => m.name && m.content).slice(0, 30)

            // Try to find price-like elements
            const allText = Array.from(document.querySelectorAll('[class*="price"], [data-testid*="price"], [class*="Price"]'))
                .map(el => ({ tag: el.tagName, cls: el.className, text: el.innerText?.slice(0, 80) }))

            // Collect data-testid attrs
            const testids = Array.from(document.querySelectorAll('[data-testid]'))
                .map(el => ({ id: el.getAttribute('data-testid'), text: el.innerText?.slice(0, 60) }))
                .slice(0, 30)

            // Page title
            const title = document.title

            // JSON-LD
            const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                .map(s => s.innerText?.slice(0, 300))

            return { title, metas, allText, testids, ld }
        }""")

        print("=== TITLE ===")
        print(info['title'])
        print("\n=== OG META ===")
        for m in info['metas']:
            print(f"  {m['name']}: {m['content']}")
        print("\n=== PRICE-CLASS ELEMENTS ===")
        for el in info['allText']:
            print(f"  [{el['tag']}] .{el['cls'][:60]} -> {el['text']}")
        print("\n=== DATA-TESTID ELEMENTS ===")
        for el in info['testids']:
            print(f"  [{el['id']}] -> {el['text']}")
        print("\n=== JSON-LD ===")
        for ld in info['ld']:
            print(f"  {ld}")

        await page2.close()
        await ctx2.close()
        await browser.close()

asyncio.run(debug())
