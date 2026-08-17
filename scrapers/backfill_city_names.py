"""
BebKey - one-shot backfill to normalize English city names to canonical Hebrew.

Why: scrapers from English-only sources (Janglo, OnMap, JPost, sometimes Facebook)
store cities like "Herzliya" / "Tel Aviv" / "Petach Tikva" while Hebrew scrapers
(Yad2, Madlan, Telegram) store "הרצליה" / "תל אביב יפו" / "פתח תקווה".  Result:
the city dropdown shows DUPLICATES, search filters split traffic across two
strings, and users on the English variant see 5-10x fewer results than they
should.

This script:
  1. Pulls every active listing whose city contains Latin characters
  2. Runs city_normalize.normalize_city() on each
  3. PATCHes the city field where the normalized value differs
  4. Logs the before/after counts

Idempotent - rerunning has no effect once everything is normalized.

Env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
import os
import sys
from collections import Counter

import httpx
from dotenv import load_dotenv

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

# Import local module
sys.path.insert(0, os.path.dirname(__file__))
from city_normalize import normalize_city

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}


def has_latin(s: str) -> bool:
    return any(("a" <= c.lower() <= "z") for c in s)


def fetch_active_listings(client: httpx.Client) -> list[dict]:
    """Pull every active listing's id + city (no row limit)."""
    all_rows = []
    offset = 0
    batch_size = 1000
    while True:
        r = client.get(
            f"{REST_URL}/listings",
            headers={**SB_HEADERS, "Range": f"{offset}-{offset + batch_size - 1}"},
            params={"select": "id,city", "is_active": "eq.true"},
            timeout=60,
        )
        if r.status_code not in (200, 206):
            print(f"Fetch error {r.status_code}: {r.text[:200]}")
            break
        batch = r.json()
        if not batch:
            break
        all_rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
        print(f"  fetched {len(all_rows)} so far...")
    return all_rows


def patch_city(client: httpx.Client, listing_id: str, new_city: str) -> bool:
    r = client.patch(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{listing_id}"},
        json={"city": new_city},
        timeout=15,
    )
    return r.status_code in (200, 204)


def main():
    print("BebKey city-name backfill starting")
    with httpx.Client() as client:
        rows = fetch_active_listings(client)
        print(f"\nFetched {len(rows)} active listings\n")

        # Stats before
        before_cities = Counter(r.get("city") for r in rows if r.get("city"))
        print(f"Distinct cities before: {len(before_cities)}")

        # Identify candidates: cities with Latin chars OR Hebrew with qualifiers
        changes = []
        for row in rows:
            city = row.get("city")
            if not city:
                continue
            normalized = normalize_city(city)
            if normalized and normalized != city:
                changes.append((row["id"], city, normalized))

        print(f"\nFound {len(changes)} listings needing city normalization")

        # Show a sample
        if changes:
            print("\nSample mappings (first 15):")
            for _, old, new in changes[:15]:
                print(f"  {old!r:40}  ->  {new!r}")

        # Apply
        if not changes:
            print("\nNothing to do - all cities already normalized.")
            return

        print(f"\nApplying {len(changes)} updates...")
        ok = 0
        fail = 0
        for i, (lid, old, new) in enumerate(changes, 1):
            if patch_city(client, lid, new):
                ok += 1
            else:
                fail += 1
            if i % 100 == 0:
                print(f"  {i}/{len(changes)} done...")
        print(f"\nResult: {ok} updated, {fail} failed")

        # Stats after
        before_top = Counter()
        for _, old, _ in changes:
            before_top[old] += 1
        print("\nMost-merged source city names:")
        for c, n in before_top.most_common(20):
            print(f"  {n:>5} listings  |  {c!r}")


if __name__ == "__main__":
    main()
