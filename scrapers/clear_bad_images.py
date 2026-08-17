"""
Clear bad placeholder images from bulletin listings.
Removes entries where images contain localize.city og placeholder URLs.
"""
import os, json
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}

# Fetch all bulletin listings with images
r = httpx.get(
    f"{REST_URL}/listings",
    headers={**HEADERS, "Prefer": ""},
    params={
        "select": "id,images",
        "source": "eq.madlan",
        "property_type": "eq.דירה",
        "is_active": "eq.true",
        "limit": "500",
    },
    timeout=20,
)
rows = r.json()
print(f"Fetched {len(rows)} bulletin listings")

BAD_PATTERNS = ["localize_og", "localize.city/og", "/og/localize"]

bad_ids = []
for row in rows:
    imgs = row.get("images") or []
    if imgs and any(any(pat in url for pat in BAD_PATTERNS) for url in imgs):
        bad_ids.append(row["id"])

print(f"Found {len(bad_ids)} listings with placeholder images - clearing...")

cleared = 0
for lid in bad_ids:
    resp = httpx.patch(
        f"{REST_URL}/listings",
        headers=HEADERS,
        params={"id": f"eq.{lid}"},
        content=json.dumps({"images": []}),
        timeout=10,
    )
    if resp.status_code in (200, 204):
        cleared += 1
    else:
        print(f"  Failed to clear {lid}: {resp.status_code}")

print(f"Done - cleared {cleared} listings")
