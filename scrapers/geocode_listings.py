"""
BebKey - Geocoding Pipeline
Fills in lat/lng for listings that have city+street but no coordinates.
Uses OpenStreetMap Nominatim (free, no API key required).
Rate limit: 1 request/second (Nominatim policy).

Run:
  python scrapers/geocode_listings.py

GitHub Actions: runs after all scrapers finish so new listings get coordinates
on the same day they are scraped.
"""

import asyncio
import os
import sys
import time
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LOG_FILE = os.path.join(os.path.dirname(__file__), "geocode_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {
    "User-Agent": "BebKey-RealEstate-Geocoder/1.0 (admin@bebkey.com)"
}

# Nominatim requires 1 second between requests
RATE_LIMIT_SECONDS = 1.1

# Batch size for fetching listings without coordinates
BATCH_SIZE = 200

# Max listings to geocode per run (to stay within CI time limits)
MAX_PER_RUN = int(os.getenv("GEOCODE_MAX_PER_RUN", "500"))


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def fetch_listings_without_coords(client: httpx.Client, offset: int) -> list:
    """Fetch listings that have city but no lat/lng."""
    try:
        r = client.get(
            f"{REST_URL}/listings",
            headers={**SB_HEADERS, "Prefer": ""},
            params={
                "select": "id,city,street,neighborhood",
                "lat": "is.null",
                "city": "not.is.null",
                "limit": BATCH_SIZE,
                "offset": offset,
                "order": "id.asc",
            },
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()
        else:
            log(f"Fetch error {r.status_code}: {r.text[:200]}")
            return []
    except Exception as e:
        log(f"Fetch exception: {e}")
        return []


def geocode(client: httpx.Client, city: str, street: str | None, neighborhood: str | None) -> tuple[float, float] | None:
    """
    Try to get coordinates using Nominatim.
    Tries progressively less specific queries until one succeeds.
    """
    queries = []

    # Build query candidates from most specific to least
    if street and city:
        queries.append(f"{street}, {city}, Israel")
    if neighborhood and city:
        queries.append(f"{neighborhood}, {city}, Israel")
    if city:
        queries.append(f"{city}, Israel")

    for query in queries:
        try:
            r = client.get(
                NOMINATIM_URL,
                headers=NOMINATIM_HEADERS,
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "il",
                },
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                if data:
                    lat = float(data[0]["lat"])
                    lng = float(data[0]["lon"])
                    return lat, lng
        except Exception as e:
            log(f"  Geocode error for '{query}': {e}")

        time.sleep(RATE_LIMIT_SECONDS)

    return None


def update_listing_coords(client: httpx.Client, listing_id: str, lat: float, lng: float) -> bool:
    """Write lat/lng back to the listing row."""
    try:
        r = client.patch(
            f"{REST_URL}/listings",
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            params={"id": f"eq.{listing_id}"},
            json={"lat": lat, "lng": lng},
            timeout=10,
        )
        return r.status_code in (200, 204)
    except Exception as e:
        log(f"  Update error: {e}")
        return False


def main():
    log("BebKey Geocoding Pipeline starting")
    log(f"Max per run: {MAX_PER_RUN}")

    total_geocoded = 0
    total_failed = 0
    offset = 0

    with httpx.Client() as client:
        while total_geocoded + total_failed < MAX_PER_RUN:
            batch = fetch_listings_without_coords(client, offset)
            if not batch:
                log("No more listings to geocode")
                break

            log(f"Processing batch of {len(batch)} listings (offset {offset})")

            for listing in batch:
                if total_geocoded + total_failed >= MAX_PER_RUN:
                    break

                listing_id = listing["id"]
                city = listing.get("city") or ""
                street = listing.get("street")
                neighborhood = listing.get("neighborhood")

                if not city:
                    total_failed += 1
                    continue

                coords = geocode(client, city, street, neighborhood)

                if coords:
                    lat, lng = coords
                    ok = update_listing_coords(client, listing_id, lat, lng)
                    if ok:
                        total_geocoded += 1
                        if total_geocoded % 10 == 0:
                            log(f"  Progress: {total_geocoded} geocoded, {total_failed} failed")
                    else:
                        total_failed += 1
                else:
                    total_failed += 1
                    log(f"  Could not geocode: {city} | {street}")

                # Always wait between Nominatim requests (even on cache hits)
                time.sleep(RATE_LIMIT_SECONDS)

            if len(batch) < BATCH_SIZE:
                # Last page
                break

            offset += BATCH_SIZE

    log(f"DONE - geocoded {total_geocoded} listings, {total_failed} failed/skipped")


if __name__ == "__main__":
    main()
