"""
Patch old seed listings that have empty images[] with picsum placeholder images.
"""
import os, sys, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

def imgs(*seeds):
    return [f"https://picsum.photos/seed/{s}/800/600" for s in seeds]

# Map seed URLs to their images
SEED_IMAGES = {
    "seed-001": imgs("apt1","apt2","apt3"),
    "seed-002": imgs("sea1","sea2","sea3"),
    "seed-003": imgs("room1","room2"),
    "seed-004": imgs("penthouse1","penthouse2","penthouse3","penthouse4"),
    "seed-005": imgs("rent1","rent2"),
    "seed-006": imgs("rent3","rent4","rent5"),
    "seed-007": imgs("apt4","apt5","apt6"),
    "seed-008": imgs("rent6","rent7"),
    "seed-009": imgs("jerusalem1","jerusalem2","jerusalem3"),
    "seed-010": imgs("jerusalem3","jerusalem4","jerusalem5"),
    "seed-011": imgs("rent8","rent9"),
    "seed-012": imgs("villa1","villa2","villa3","villa4"),
    "seed-013": imgs("rent10","rent11","rent12"),
    "seed-014": imgs("haifa1","haifa2","haifa3"),
    "seed-015": imgs("haifa4","haifa5"),
}

# Fetch all listings with empty images
r = httpx.get(
    f"{REST_URL}/listings",
    headers={**HEADERS, "Prefer": "count=none"},
    params={"select": "id,source_url,images", "source_url": "like.*seed-*"},
    timeout=15,
)
print(f"Status: {r.status_code}, Body: {r.text[:200]}")
listings = r.json() if r.text.strip() else []
print(f"Found {len(listings)} seed listings to check")

patched = 0
for listing in listings:
    url = listing.get("source_url", "")
    images = listing.get("images") or []
    if images:
        print(f"  Already has images: {url}")
        continue
    # Find the seed key
    for key, image_list in SEED_IMAGES.items():
        if key in url:
            r2 = httpx.patch(
                f"{REST_URL}/listings",
                headers={**HEADERS, "Prefer": "return=minimal"},
                params={"id": f"eq.{listing['id']}"},
                content=json.dumps({"images": image_list}),
                timeout=10,
            )
            if r2.status_code in (200, 204):
                print(f"  Patched: {url}")
                patched += 1
            else:
                print(f"  Error patching {url}: {r2.status_code} {r2.text[:100]}")
            break

print(f"\nDone: {patched} listings patched")
