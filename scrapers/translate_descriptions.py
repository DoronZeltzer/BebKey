"""
BebKey - Batch Description Translator
Translates all Hebrew property descriptions to EN, RU, AR, FR using DeepL.

Run once after applying supabase/add_translation_columns.sql.
Safe to re-run: skips listings already translated (description_en is not null).

Usage:
    python scrapers/translate_descriptions.py
"""

import os, sys, json, time
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

DEEPL_KEY    = os.getenv("DEEPL_API_KEY")
DEEPL_URL    = "https://api-free.deepl.com/v2/translate"   # :fx key → free endpoint
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Max listings to translate per run - prevents workflow timeout when backlog is large
MAX_PER_RUN  = int(os.getenv("DEEPL_MAX_PER_RUN", "300"))

if not DEEPL_KEY:
    print("DEEPL_API_KEY not set - skipping translation step"); sys.exit(0)
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase env vars missing"); sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

# Target languages: (DeepL code, DB column)
TARGETS = [
    ("EN", "description_en"),
    ("RU", "description_ru"),
    ("AR", "description_ar"),
    ("FR", "description_fr"),
]

def ts():
    return datetime.now().strftime("%H:%M:%S")

_quota_exceeded = False  # module-level flag; set on first 456 to stop all further calls


def deepl_translate(text: str, target_lang: str) -> str | None:
    """Translate `text` from Hebrew to `target_lang` using DeepL."""
    global _quota_exceeded
    if _quota_exceeded:
        return None
    if not text or not text.strip():
        return None
    try:
        r = httpx.post(
            DEEPL_URL,
            headers={"Authorization": f"DeepL-Auth-Key {DEEPL_KEY}"},
            json={
                "text": [text],
                "source_lang": "HE",
                "target_lang": target_lang,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["translations"][0]["text"]
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 456:
            _quota_exceeded = True
            print(f"  [{ts()}] DeepL quota exceeded (HTTP 456) - aborting translation run")
        else:
            print(f"  [{ts()}] DeepL HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        print(f"  [{ts()}] DeepL error: {e}")
        return None

def fetch_listings_to_translate():
    """Fetch listings that have a Hebrew description but no English translation yet."""
    all_listings = []
    page_size = 1000
    offset = 0

    while True:
        r = httpx.get(
            f"{REST_URL}/listings",
            headers={**SB_HEADERS, "Prefer": "count=exact"},
            params={
                "select":         "id,description",
                "description":    "not.is.null",
                "description_en": "is.null",
                "is_active":      "eq.true",
                "limit":          page_size,
                "offset":         offset,
            },
            timeout=30,
        )
        batch = r.json()
        if not isinstance(batch, list) or not batch:
            break
        all_listings.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    return all_listings

def patch_listing(listing_id: str, updates: dict):
    r = httpx.patch(
        f"{REST_URL}/listings",
        headers=SB_HEADERS,
        params={"id": f"eq.{listing_id}"},
        content=json.dumps(updates),
        timeout=15,
    )
    return r.status_code in (200, 204)

def main():
    global _quota_exceeded
    print(f"[{ts()}] Fetching listings with untranslated descriptions (max {MAX_PER_RUN}/run)...")
    listings = fetch_listings_to_translate()
    total = len(listings)

    if total == 0:
        print(f"[{ts()}] Nothing to translate - all descriptions are already translated!")
        return

    # Cap to MAX_PER_RUN so a large backlog doesn't eat the whole workflow
    batch = listings[:MAX_PER_RUN]
    print(f"[{ts()}] Found {total} listings to translate. Processing {len(batch)} this run.\n")

    ok_count = 0
    skip_count = 0
    fail_count = 0

    for i, listing in enumerate(batch, 1):
        # Bail immediately if quota was exceeded mid-run
        if _quota_exceeded:
            print(f"[{ts()}] Quota exceeded - stopping early after {i-1} listings")
            break

        lid  = listing["id"]
        desc = (listing.get("description") or "").strip()

        if len(desc) < 5:
            print(f"[{i}/{len(batch)}] {lid[:8]}... SKIP (description too short)")
            skip_count += 1
            continue

        print(f"[{i}/{len(batch)}] [{ts()}] {lid[:8]}...  \"{desc[:60]}{'...' if len(desc)>60 else ''}\"")

        updates = {}
        for target_lang, col in TARGETS:
            if _quota_exceeded:
                break
            translated = deepl_translate(desc, target_lang)
            if translated:
                updates[col] = translated
                print(f"  ✓ {target_lang}: {translated[:70]}{'...' if len(translated)>70 else ''}")
            else:
                print(f"  ✗ {target_lang}: translation failed")

        if updates:
            success = patch_listing(lid, updates)
            if success:
                ok_count += 1
            else:
                print(f"  ✗ DB update failed for {lid[:8]}")
                fail_count += 1
        elif not _quota_exceeded:
            fail_count += 1

        # Polite delay - DeepL free tier is generous but let's not hammer it
        time.sleep(0.3)

    remaining = total - MAX_PER_RUN
    if remaining > 0 and not _quota_exceeded:
        print(f"[{ts()}] {remaining} listings remain for next runs.")
    print(f"\n[{ts()}] Done! ✓ {ok_count} translated | ⟳ {skip_count} skipped | ✗ {fail_count} failed")

if __name__ == "__main__":
    main()
