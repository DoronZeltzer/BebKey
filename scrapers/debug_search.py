"""
Debug: dump the Yad2 search page links to see what URL pattern listings use.
"""
import asyncio
import sys, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

URL = "https://www.yad2.co.il/realestate/forsale"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="he-IL",
            extra_http_headers={
                "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        )
        # Override navigator.webdriver
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        page = await ctx.new_page()
        print(f"Navigating to {URL}...")
        await page.goto(URL, timeout=30000, wait_until="networkidle")
        await asyncio.sleep(5)

        title = await page.title()
        print(f"Title: {title}")

        # Dump all hrefs
        links = await page.evaluate("""() => {
            const all = Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(h => h.includes('yad2'))
            return [...new Set(all)].slice(0, 50)
        }""")

        print(f"\nLinks found: {len(links)}")
        for l in links:
            print(f"  {l}")

        # Also check the page HTML length
        html_len = await page.evaluate("() => document.body.innerHTML.length")
        print(f"\nHTML body length: {html_len}")

        # Check for captcha/block
        blocked = await page.evaluate("""() => {
            const text = document.body.innerText || ''
            return text.slice(0, 500)
        }""")
        print(f"\nPage text (first 500): {blocked}")

        await browser.close()

asyncio.run(main())
