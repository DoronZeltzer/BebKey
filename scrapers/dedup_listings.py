"""
BebKey - Deduplicate Listings

Two dedup passes:

Pass 1 - Same-source dedup:
  Same (source, city, price, rooms) inserted ≥7 days apart.
  Very likely the same listing re-scraped without a source_id change.

Pass 2 - Cross-source dedup:
  Same (city, price, rooms, size_m2) regardless of source, within 5% price
  tolerance, inserted ≥2 days apart.
  Catches the same apartment listed on both Yad2 AND Madlan.

In both passes: keep the listing with the highest quality_score (or highest id).
"""

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "dedup_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase env vars"); sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

PATCH_BATCH_SIZE = 200
# Same-source: must be ≥7 days apart
MIN_AGE_DIFF_DAYS = 7
# Cross-source: can be ≥2 days apart (already from different sites)
CROSS_MIN_AGE_DIFF_DAYS = 2
# Cross-source price tolerance (5%)
PRICE_TOLERANCE = 0.05


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Supabase helpers ──────────────────────────────────────────────────────────

def fetch_all_active_listings(client: httpx.Client) -> list[dict]:
    """Return all active listings with the fields needed for dedup."""
    listings = []
    offset, limit = 0, 1000
    while True:
        try:
            r = client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={
                    "select":    "id,source,city,price,rooms,size_m2,quality_score,created_at",
                    "is_active": "eq.true",
                    "limit":     limit,
                    "offset":    offset,
                },
                timeout=30,
            )
            rows = r.json()
            if not isinstance(rows, list) or not rows:
                break
            listings.extend(rows)
            if len(rows) < limit:
                break
            offset += limit
        except Exception as e:
            log(f"Fetch error: {e}")
            break
    return listings


def patch_inactive_sync(client: httpx.Client, ids: list[int]) -> int:
    """Batch PATCH is_active=false for the given IDs. Returns count patched."""
    deactivated = 0
    for i in range(0, len(ids), PATCH_BATCH_SIZE):
        batch = ids[i : i + PATCH_BATCH_SIZE]
        id_csv = ",".join(str(x) for x in batch)
        try:
            r = client.patch(
                f"{REST_URL}/listings",
                headers=SB_HEADERS,
                params={"id": f"in.({id_csv})"},
                content=json.dumps({"is_active": False}),
                timeout=30,
            )
            if r.status_code in (200, 204):
                deactivated += len(batch)
                log(f"  Deactivated batch of {len(batch)} (IDs {batch[0]}...{batch[-1]})")
            else:
                log(f"  PATCH error {r.status_code}: {r.text[:120]}")
        except Exception as e:
            log(f"  PATCH exception: {e}")
    return deactivated


# ── Dedup logic ───────────────────────────────────────────────────────────────

def find_cross_source_duplicate_groups(listings: list[dict]) -> list[list[dict]]:
    """
    Cross-source dedup: find listings that are the same apartment listed on
    multiple sites.  Three matching strategies (strongest first):

    A) Street match  - same city + street + price ±10%  (very strong signal)
    B) Full match    - same city + rooms + size_m2 ±5m² + price ±5%
    C) Loose match   - same city + rooms + price ±3%  (when size_m2 missing)

    All strategies require different sources and ≥CROSS_MIN_AGE_DIFF_DAYS apart.
    """
    from collections import defaultdict
    min_diff = timedelta(days=CROSS_MIN_AGE_DIFF_DAYS)

    def parse_ts(row: dict):
        ts = row.get("created_at", "")
        if not ts:
            return datetime.min.replace(tzinfo=timezone.utc)
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    def prices_match(p_a, p_b, tolerance):
        if not p_a or not p_b:
            return False
        pa, pb = float(p_a), float(p_b)
        if pa == 0:
            return False
        return abs(pa - pb) / pa <= tolerance

    def age_ok(a, b):
        return abs(parse_ts(a) - parse_ts(b)) >= min_diff

    def different_source(a, b):
        return a.get("source") != b.get("source")

    dup_groups:  list[list[dict]] = []
    matched_ids: set              = set()

    # ── Strategy A: street-based (strongest signal) ───────────────────────────
    # Normalise street: lowercase, strip spaces, ignore house number
    def norm_street(s):
        if not s:
            return None
        s = re.sub(r'\s+\d+\s*$', '', s)  # remove trailing house number
        return re.sub(r'\s+', ' ', s.strip().lower())

    street_buckets: dict[tuple, list[dict]] = defaultdict(list)
    for r in listings:
        if not r.get("city") or not r.get("street") or not r.get("price"):
            continue
        key = (r["city"].strip().lower(), norm_street(r.get("street")))
        if key[1]:
            street_buckets[key].append(r)

    for members in street_buckets.values():
        if len(members) < 2:
            continue
        used: set = set()
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if a["id"] in used or b["id"] in used:
                    continue
                if a["id"] in matched_ids or b["id"] in matched_ids:
                    continue
                if not different_source(a, b):
                    continue
                if not age_ok(a, b):
                    continue
                if not prices_match(a["price"], b["price"], 0.10):
                    continue
                dup_groups.append([a, b])
                used.update([a["id"], b["id"]])
                matched_ids.update([a["id"], b["id"]])

    # ── Strategy B: full match (city + rooms + size_m2 + price) ──────────────
    full_buckets: dict[tuple, list[dict]] = defaultdict(list)
    for r in listings:
        if not r.get("city") or not r.get("price") or not r.get("rooms") or not r.get("size_m2"):
            continue
        size_bucket = round(float(r["size_m2"]) / 5) * 5
        key = (r["city"].strip().lower(), r["rooms"], size_bucket)
        full_buckets[key].append(r)

    for members in full_buckets.values():
        if len(members) < 2:
            continue
        used: set = set()
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if a["id"] in used or b["id"] in used:
                    continue
                if a["id"] in matched_ids or b["id"] in matched_ids:
                    continue
                if not different_source(a, b):
                    continue
                if not age_ok(a, b):
                    continue
                if not prices_match(a["price"], b["price"], PRICE_TOLERANCE):
                    continue
                dup_groups.append([a, b])
                used.update([a["id"], b["id"]])
                matched_ids.update([a["id"], b["id"]])

    # ── Strategy C: loose match (city + rooms + tight price, no size_m2) ─────
    # Only applied when size_m2 is absent in at least one listing
    loose_buckets: dict[tuple, list[dict]] = defaultdict(list)
    for r in listings:
        if not r.get("city") or not r.get("price") or not r.get("rooms"):
            continue
        if r.get("size_m2"):
            continue  # has size_m2 - already covered by strategy B
        key = (r["city"].strip().lower(), r["rooms"])
        loose_buckets[key].append(r)

    for members in loose_buckets.values():
        if len(members) < 2:
            continue
        used: set = set()
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if a["id"] in used or b["id"] in used:
                    continue
                if a["id"] in matched_ids or b["id"] in matched_ids:
                    continue
                if not different_source(a, b):
                    continue
                if not age_ok(a, b):
                    continue
                # Tighter price tolerance when no size confirmation
                if not prices_match(a["price"], b["price"], 0.03):
                    continue
                dup_groups.append([a, b])
                used.update([a["id"], b["id"]])
                matched_ids.update([a["id"], b["id"]])

    return dup_groups


def find_duplicate_groups(listings: list[dict]) -> list[list[dict]]:
    """
    Group listings by (source, city, price, rooms).
    Return groups where at least one member was inserted >= MIN_AGE_DIFF_DAYS
    before another (i.e. true duplicates rather than simultaneous re-posts).
    """
    groups: dict[tuple, list[dict]] = {}
    for row in listings:
        # Skip rows with None in key fields - they can't be meaningfully deduped
        source = row.get("source")
        city   = row.get("city")
        price  = row.get("price")
        rooms  = row.get("rooms")
        if source is None or city is None or price is None or rooms is None:
            continue
        key = (source, city, price, rooms)
        groups.setdefault(key, []).append(row)

    dup_groups = []
    min_diff = timedelta(days=MIN_AGE_DIFF_DAYS)

    for key, members in groups.items():
        if len(members) < 2:
            continue

        # Parse created_at for age comparison
        def parse_ts(row: dict):
            ts = row.get("created_at", "")
            if not ts:
                return datetime.min.replace(tzinfo=timezone.utc)
            try:
                # Supabase returns ISO 8601 with +00:00 or Z
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)

        timestamps = [parse_ts(m) for m in members]
        oldest = min(timestamps)
        newest = max(timestamps)
        if newest - oldest >= min_diff:
            dup_groups.append(members)

    return dup_groups


def pick_winner(group: list[dict]) -> int:
    """Return the ID of the listing to keep (highest quality_score, then highest id)."""
    def sort_key(row):
        qs = row.get("quality_score") or 0
        return (qs, row.get("id", 0))

    winner = max(group, key=sort_key)
    return winner["id"]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("=== dedup_listings.py starting ===")

    with httpx.Client(timeout=60) as client:
        log("Fetching all active listings...")
        listings = fetch_all_active_listings(client)
        log(f"Fetched {len(listings)} active listings")

        # ── Pass 1: same-source dedup ─────────────────────────────────────────
        same_src_groups = find_duplicate_groups(listings)
        log(f"Pass 1 (same-source): {len(same_src_groups)} duplicate groups")

        ids_to_deactivate: list[int] = []
        for group in same_src_groups:
            winner_id = pick_winner(group)
            ids_to_deactivate.extend(r["id"] for r in group if r["id"] != winner_id)

        # ── Pass 2: cross-source dedup ────────────────────────────────────────
        cross_groups = find_cross_source_duplicate_groups(listings)
        log(f"Pass 2 (cross-source): {len(cross_groups)} duplicate groups")

        already_marked = set(ids_to_deactivate)
        for group in cross_groups:
            winner_id = pick_winner(group)
            for r in group:
                if r["id"] != winner_id and r["id"] not in already_marked:
                    ids_to_deactivate.append(r["id"])
                    already_marked.add(r["id"])

        log(f"Total {len(ids_to_deactivate)} listings to deactivate")

        deactivated = 0
        if ids_to_deactivate:
            deactivated = patch_inactive_sync(client, ids_to_deactivate)

    summary = (
        f"=== DONE: same-src={len(same_src_groups)} groups, "
        f"cross-src={len(cross_groups)} groups, "
        f"deactivated {deactivated} listings ==="
    )
    log(summary)


if __name__ == "__main__":
    main()
