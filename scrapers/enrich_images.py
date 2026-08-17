"""
BebKey - Madlan Image Enrichment
Fetches listings that have no images (images = '{}') from Supabase,
visits each Madlan listing detail page via non-headless Playwright,
intercepts the page's own API response to extract real photo URLs,
then patches the listing in Supabase.

Run locally: python scrapers/enrich_images.py
"""

import asyncio, json, os, sys, random
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from playwright.async_api import async_playwright
import httpx

LOG_FILE = os.path.join(os.path.dirname(__file__), "enrich_images_log.txt")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f: f.write(line + "\n")

def fetch_listings_without_images(limit=500):
    """Fetch Madlan bulletin (דירה) listings - filter for empty images in Python."""
    r = httpx.get(
        f"{REST_URL}/listings",
        headers={**HEADERS, "Prefer": ""},
        params={
            "select": "id,source_url,city,description,images",
            "source": "eq.madlan",
            "property_type": "eq.דירה",   # bulletin type - these lack images from map view
            "is_active": "eq.true",
            "order": "id.asc",
            "limit": str(limit),
        },
        timeout=20,
    )
    all_rows = r.json()
    # Filter in Python: only those with empty images list
    return [row for row in all_rows if not row.get("images")]

def patch_listing(listing_id, images, description=None):
    payload = {"images": images}
    if description:
        payload["description"] = description
    r = httpx.patch(
        f"{REST_URL}/listings",
        headers=HEADERS,
        params={"id": f"eq.{listing_id}"},
        content=json.dumps(payload),
        timeout=10,
    )
    return r.status_code in (200, 204)

async def enrich_listing(page, listing):
    """Navigate to the Madlan listing detail page and capture images + description."""
    url = listing["source_url"]
    images = []
    description = None

    captured = {}

    async def on_response(resp):
        if "/api2" not in resp.url and "/api3" not in resp.url:
            return
        try:
            body = await resp.json()
            data = body.get("data") or {}
            # Single listing detail - look for bulletin or project
            for key in ("bulletin", "project", "listing"):
                item = data.get(key)
                if item:
                    captured["item"] = item
                    return
            # Also handle searchPoiV2 in case it fires
            spv2 = data.get("searchPoiV2") or {}
            pois = spv2.get("poi") or []
            if pois:
                captured["item"] = pois[0]
        except Exception:
            pass

    page.on("response", on_response)
    try:
        await page.goto(url, timeout=30000, wait_until="networkidle")
        await asyncio.sleep(3)

        item = captured.get("item")
        if item:
            # Try bulletin image format
            raw_imgs = item.get("images") or []
            for img in raw_imgs:
                if isinstance(img, dict):
                    src = img.get("imageUrl") or img.get("path") or img.get("url")
                    # Skip floorplans and og placeholder images
                    if src and not img.get("isFloorplan") and "/og/" not in src and "logo" not in src:
                        images.append(src)
                elif isinstance(img, str) and len(img) > 10:
                    if "/og/" not in img and "logo" not in img:
                        images.append(img)
            images = images[:8]
            description = item.get("description") or item.get("shortDescription")

        if not images:
            # DOM fallback: look for actual property images in page (NOT og:image placeholders)
            imgs_from_dom = await page.evaluate("""
                () => {
                    // Look for real property photos - Madlan uses prod-images.localize.city for actual photos
                    // Filter out the generic OG placeholder (/og/ path) and site logos
                    const imgs = Array.from(document.querySelectorAll(
                        'img[src*="prod-images.localize.city"], img[src*="images2.madlan"], img[src*="madlan.co.il/images"]'
                    ));
                    return imgs
                        .map(i => i.src)
                        .filter(s => s && s.length > 30 && !s.includes('/og/') && !s.includes('logo') && !s.includes('icon'))
                        .slice(0, 8);
                }
            """)
            images = list(dict.fromkeys(imgs_from_dom))  # dedupe, preserve order

        if not description:
            # Try extracting from page meta description
            desc_meta = await page.evaluate("""
                () => {
                    const m = document.querySelector('meta[name="description"]');
                    return m ? m.content : null;
                }
            """)
            if desc_meta and len(desc_meta) > 20:
                description = desc_meta

    except Exception as e:
        log(f"  Error loading {url}: {e}")
    finally:
        page.remove_listener("response", on_response)

    return images, description

async def run():
    log("BebKey Image Enrichment started")

    listings = fetch_listings_without_images(limit=300)
    log(f"Found {len(listings)} listings without images")

    if not listings:
        log("Nothing to enrich.")
        return

    enriched = 0
    failed = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1366, "height": 768},
            locale="he-IL",
            extra_http_headers={"Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8"},
        )

        for i, listing in enumerate(listings):
            log(f"[{i+1}/{len(listings)}] {listing['source_url']}")
            page = await ctx.new_page()
            images, description = await enrich_listing(page, listing)
            await page.close()

            if images:
                ok = patch_listing(listing["id"], images, description)
                if ok:
                    log(f"  ✓ {len(images)} images patched - {listing.get('city','?')}")
                    enriched += 1
                else:
                    log(f"  ✗ Patch failed for {listing['id']}")
                    failed += 1
            else:
                log(f"  - No images found, skipping patch")
                failed += 1

            await asyncio.sleep(random.uniform(1.5, 3.0))

            # Refresh context every 50 listings to keep PX session warm
            if (i + 1) % 50 == 0:
                await ctx.close()
                ctx = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    viewport={"width": 1366, "height": 768},
                    locale="he-IL",
                )
                log(f"  [Context refreshed at listing {i+1}]")

        await ctx.close()
        await browser.close()

    log(f"Enrichment complete - {enriched} patched, {failed} no images found")

if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as e:
        log(f"Fatal error: {e}")
        import traceback; log(traceback.format_exc())
