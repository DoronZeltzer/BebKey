"""
Delete all fake/seed listings from Supabase.
Seeds are identified by source_url containing 'seed-'
Run: python delete_seeds.py
"""
import os, sys, httpx
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# First: count how many we're about to delete
r = httpx.get(
    f"{REST_URL}/listings",
    headers={**HEADERS, "Prefer": "count=exact"},
    params={"select": "id,source_url", "source_url": "like.*seed-*"},
    timeout=15,
)
rows = r.json()
print(f"Found {len(rows)} seed listings to delete:")
for row in rows:
    print(f"  {row['source_url']}")

if not rows:
    print("Nothing to delete.")
    sys.exit(0)

# Delete them
r2 = httpx.delete(
    f"{REST_URL}/listings",
    headers=HEADERS,
    params={"source_url": "like.*seed-*"},
    timeout=15,
)

if r2.status_code in (200, 204):
    deleted = r2.json() if r2.text else []
    print(f"\n✓ Deleted {len(deleted) if isinstance(deleted, list) else 'all'} seed listings successfully.")
else:
    print(f"\n✗ Delete failed ({r2.status_code}): {r2.text[:300]}")
