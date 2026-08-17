"""
One-time backfill: compute quality_score + has_image for all listings.

Formula (max 10):
  Images bucket : >=5 imgs → 5pts | >=3 → 4pts | >=1 → 3pts | 0 → 0pts
  Completeness  : +1 each for price / rooms / size_m2 / city / description>50

Run: python scrapers/backfill_quality_score.py
"""

import os, sys, json, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
REST = f"{URL}/rest/v1"
HEADERS = {
    "apikey": KEY, "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

def compute(listing: dict) -> dict:
    imgs = listing.get("images") or []
    n = len(imgs)
    score = (5 if n >= 5 else 4 if n >= 3 else 3 if n >= 1 else 0)
    score += 1 if listing.get("price")  is not None else 0
    score += 1 if listing.get("rooms")  is not None else 0
    score += 1 if listing.get("size_m2") is not None else 0
    score += 1 if listing.get("city")   is not None else 0
    score += 1 if len(listing.get("description") or "") > 50 else 0
    return {"quality_score": score, "has_image": n > 0}

def main():
    offset, limit, total_updated = 0, 200, 0

    with httpx.Client(timeout=30) as client:
        while True:
            r = client.get(
                f"{REST}/listings",
                headers={**HEADERS, "Prefer": ""},
                params={
                    "select": "id,images,price,rooms,size_m2,city,description",
                    "limit": limit, "offset": offset,
                    "order": "id.asc",
                },
            )
            rows = r.json()
            if not rows:
                break

            for row in rows:
                patch = compute(row)
                resp = client.patch(
                    f"{REST}/listings",
                    headers=HEADERS,
                    params={"id": f"eq.{row['id']}"},
                    json=patch,
                )
                if resp.status_code in (200, 204):
                    total_updated += 1
                else:
                    print(f"  ERR {row['id']}: {resp.status_code} {resp.text[:80]}")

            print(f"  Processed offset={offset}+{len(rows)} → {total_updated} updated so far")
            if len(rows) < limit:
                break
            offset += limit
            time.sleep(0.5)   # be gentle on rate limits

    print(f"\nDone - {total_updated} listings backfilled.")

if __name__ == "__main__":
    main()
