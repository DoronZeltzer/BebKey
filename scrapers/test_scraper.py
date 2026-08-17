"""
Quick test - scrapes ONE page of Yad2, limits to 3 listings.
Run: python test_scraper.py
"""
import asyncio
import sys
import os

# Patch run() to only do 1 page + 3 listings
import yad2_scraper as s

async def test():
    s.log("🧪 TEST MODE - 1 page, max 3 listings")

    async with __import__('playwright').async_api.async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        search_url = "https://www.yad2.co.il/realestate/forsale?page=1"
        context = await browser.new_context(
            user_agent=s.USER_AGENTS[0],
            viewport={"width": 1280, "height": 800},
            locale="he-IL",
        )
        page = await context.new_page()
        urls = await s.get_listing_urls(page, search_url)
        await page.close()
        await context.close()

        s.log(f"Found {len(urls)} URLs - testing first 3")
        urls = urls[:3]

        for url in urls:
            ctx = await browser.new_context(
                user_agent=s.USER_AGENTS[0],
                viewport={"width": 1280, "height": 800},
                locale="he-IL",
            )
            listing_page = await ctx.new_page()
            data = await s.scrape_listing(listing_page, url)
            await listing_page.close()
            await ctx.close()

            if data:
                s.log(f"  city={data.get('city')}  price={data.get('price')}  rooms={data.get('rooms')}  size={data.get('size_m2')}")
                s.log(f"  -> would insert to Supabase (skipped in test mode)")
            else:
                s.log(f"  No data scraped for {url}")

            await asyncio.sleep(2)

        await browser.close()

    s.log("✅ Test complete - check output above")

if __name__ == "__main__":
    asyncio.run(test())
