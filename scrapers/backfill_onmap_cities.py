"""
One-time backfill: normalize English city names → Hebrew for OnMap listings.
Run: python scrapers/backfill_onmap_cities.py
"""
import os, sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv
import httpx
from city_normalize import normalize_city

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST = f"{URL}/rest/v1"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

with httpx.Client(timeout=30) as client:
    r = client.get(f"{REST}/listings",
                   headers={**HEADERS, "Prefer": ""},
                   params={"select": "id,city", "source": "eq.onmap", "limit": "1000"})
    rows = r.json()
    print(f"Fetched {len(rows)} OnMap listings")

    updated = skipped = 0
    for row in rows:
        original = row.get("city")
        normalized = normalize_city(original)
        if normalized != original:
            resp = client.patch(f"{REST}/listings",
                                headers=HEADERS,
                                params={"id": f"eq.{row['id']}"},
                                json={"city": normalized})
            if resp.status_code in (200, 204):
                print(f"  {original!r:30s} → {normalized!r}")
                updated += 1
            else:
                print(f"  ERR {row['id']}: {resp.status_code} {resp.text[:80]}")
        else:
            skipped += 1

print(f"\nDone - {updated} updated, {skipped} already correct.")
