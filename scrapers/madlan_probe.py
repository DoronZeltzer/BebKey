"""
One-shot probe: loads Madlan search page and captures the exact GraphQL
request+response sent to /api2 or /api3. Dumps to madlan_probe.json.
Run: python madlan_probe.py
"""
import asyncio, json, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright

CAPTURED = []

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1366, "height": 768},
            locale="he-IL",
        )
        page = await ctx.new_page()

        async def on_request(req):
            # Capture ALL requests
            body = req.post_data
            parsed = None
            if body:
                try: parsed = json.loads(body)
                except: pass
            entry = {"type": "request", "url": req.url, "method": req.method,
                     "body_preview": (body or "")}
            CAPTURED.append(entry)
            if req.method == "POST" or "madlan" in req.url:
                print(f"REQ  {req.method} {req.url[:100]}  body={str(body or '')[:80]}")

        async def on_response(resp):
            # Only capture POST JSON responses
            if resp.request.method == "POST":
                try:
                    body = await resp.json()
                    CAPTURED.append({"type": "response", "url": resp.url,
                                     "status": resp.status, "body": body})
                    print(f"RESP ← {resp.url[:100]}  status={resp.status}  keys={list((body.get('data') or body or {}).keys())[:5]}")
                except Exception as e:
                    pass

        page.on("request", on_request)
        page.on("response", on_response)

        url = "https://www.madlan.co.il/for-sale/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91-%D7%99%D7%A4%D7%95-%D7%99%D7%A9%D7%A8%D7%90%D7%9C"
        print(f"Loading: {url}")
        await page.goto(url, timeout=30000, wait_until="networkidle")

        # Scroll to trigger lazy loads
        for _ in range(3):
            await page.keyboard.press("End")
            await asyncio.sleep(2)

        await browser.close()

    out = os.path.join(os.path.dirname(__file__), "madlan_probe.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(CAPTURED, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(CAPTURED)} entries to {out}")

asyncio.run(run())
