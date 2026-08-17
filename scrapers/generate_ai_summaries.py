"""
BebKey - AI summary generator for property listings.

Calls Claude Haiku (claude-haiku-4-5) to produce short bilingual summaries,
pros, and lifestyle tags for listings that have not yet been enriched.

Processed fields per listing:
  city, property_type, rooms, size_m2, floor, deal_type, price,
  description (first 400 chars), parking, elevator, balcony, garden,
  storage, ac, renovated

Output JSON stored in listings.ai_summary:
  {
    "summary_he": "...",   -- 2-sentence Hebrew summary
    "summary_en": "...",   -- 2-sentence English summary
    "pros": ["...", "...", "..."],
    "lifestyle_tags": [...]  -- up to 4 tags from the approved set
  }

Required env vars:
  ANTHROPIC_API_KEY
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import json
import time
from datetime import datetime

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
import anthropic
from dotenv import load_dotenv
from monitoring import init_sentry

init_sentry("ai_summaries")
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "ai_summaries_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: missing Supabase env vars"); sys.exit(1)
if not ANTHROPIC_KEY:
    print("ANTHROPIC_API_KEY not set - skipping AI summary generation.  "
          "Add the key as an env var or GitHub Secret to enable this step.")
    sys.exit(0)

REST_URL   = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

BATCH_SIZE   = 10
BATCH_DELAY  = 0.5   # seconds between batches
# Env-driven so the workflow's AI_SUMMARY_BATCH_SIZE=500 actually applies.
# 19,517-listing backlog at 500/run × 2 runs/day = ~20 days.  Bumping to
# 1000 default gets us to ~10 days at Anthropic Haiku cost ~$0.26/run.
FETCH_LIMIT  = int(os.getenv("AI_SUMMARY_BATCH_SIZE", "1000"))
MODEL        = "claude-haiku-4-5"

# ── Prompt caching ──────────────────────────────────────────────────────────
# The instructions / output schema are identical for every listing.  Sending
# them in `system=` with `cache_control: {"type": "ephemeral"}` makes
# Anthropic cache them server-side; subsequent calls bill the cached portion
# at 10% of normal input-token price.  Combined with shipping only the
# per-listing variables in the user message, this drops effective input-
# token use ~70% and keeps us safely under the Tier 1 Haiku ITPM ceiling.
SYSTEM_PROMPT = """You are a real estate assistant. Summarize Israeli \
property listings concisely.

Respond with valid JSON only (no markdown, no code fences):
{"summary_he": "...", "summary_en": "...", "pros": ["...", "...", "..."], "lifestyle_tags": [...]}

Each summary is 2 short sentences. `pros` is a list of up to 3 short
bullet phrases. `lifestyle_tags` is a subset of:
  family, young_couple, investor, students, luxury, budget, sea_view,
  city_center, quiet, pet_friendly
Pick up to 4 tags that genuinely match the listing."""

# Small per-call delay to keep requests-per-minute under the Tier 1 Haiku
# ceiling.  At 0.3s between calls we sit around 3 RPS / 180 RPM theoretical,
# but actual throughput is gated by network latency to Anthropic — so the
# effective rate hovers around 30–50 RPM, comfortably inside Tier 1's
# 50-RPM limit.  Throttle applies inside the `finally` block of call_claude.
PER_CALL_DELAY_S = 0.3

APPROVED_TAGS = [
    "family", "young_couple", "investor", "students",
    "luxury", "budget", "sea_view", "city_center", "quiet", "pet_friendly",
]

DEAL_TYPE_LABELS = {
    "rent":       "For Rent",
    "sale":       "For Sale",
    "commercial": "Commercial",
}


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def fetch_listings(client: httpx.Client) -> list[dict]:
    # Column names match the actual listings schema.  The old query asked
    # for `garden`, `storage`, `ac`, `renovated` - none of which exist -
    # which made PostgREST return HTTP 400 and the script silently fall
    # back to an empty list (logged as "Found 0 listings").  Real columns
    # in their place: storage_room, air_conditioning, condition; there's
    # no garden column on listings (it could be inferred from description).
    r = client.get(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": ""},
        params={
            "select": (
                "id,city,neighborhood,property_type,rooms,size_m2,floor,"
                "deal_type,price,description,"
                "parking,elevator,balcony,storage_room,air_conditioning,"
                "mamad,furnished,accessible,condition"
            ),
            "ai_summary": "is.null",
            "is_active":  "eq.true",
            "order":      "scraped_at.desc",
            "limit":      str(FETCH_LIMIT),
        },
        timeout=30,
    )
    if r.status_code != 200:
        log(f"ERROR fetching listings: {r.status_code} {r.text[:200]}")
        return []
    return r.json()


def build_prompt(listing: dict) -> str:
    rooms        = listing.get("rooms") or "?"
    size_m2      = listing.get("size_m2") or "?"
    floor        = listing.get("floor") if listing.get("floor") is not None else "?"
    property_type = listing.get("property_type") or "property"
    city         = listing.get("city") or "Israel"
    neighborhood = listing.get("neighborhood")
    deal_type    = listing.get("deal_type") or "sale"
    price        = listing.get("price") or 0
    description  = (listing.get("description") or "")[:400]

    deal_type_label = DEAL_TYPE_LABELS.get(deal_type, deal_type.capitalize())

    # Build neighborhood suffix
    neighborhood_str = f", {neighborhood}" if neighborhood else ""

    # Collect boolean/text feature flags - keys match the actual columns.
    feature_map = {
        "parking":            "parking",
        "elevator":           "elevator",
        "balcony":            "balcony",
        "storage_room":       "storage room",
        "air_conditioning":   "air conditioning",
        "mamad":              "safe room",
        "furnished":          "furnished",
        "accessible":         "accessible",
    }
    active_features = [
        label for field, label in feature_map.items()
        if listing.get(field)
    ]
    features_list = ", ".join(active_features) if active_features else "none listed"

    desc_snippet = description.strip().replace("\n", " ") if description else "N/A"

    # Static "you are a real-estate assistant ... respond with JSON ..."
    # instructions now live in SYSTEM_PROMPT and get prompt-cached server-side,
    # so this user message only carries the per-listing variables.
    prompt = (
        f"Property: {rooms} rooms, {size_m2}m², floor {floor}, {property_type}\n"
        f"Location: {city}{neighborhood_str}\n"
        f"Deal: {deal_type_label} for ₪{price:,}\n"
        f"Features: {features_list}\n"
        f"Description: {desc_snippet}"
    )
    return prompt


def call_claude(ai_client: anthropic.Anthropic, prompt: str) -> dict | None:
    try:
        message = ai_client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown code fences if Claude wraps them anyway
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)

        # Validate and sanitise lifestyle_tags
        tags = data.get("lifestyle_tags", [])
        if isinstance(tags, list):
            data["lifestyle_tags"] = [t for t in tags if t in APPROVED_TAGS][:4]

        # Validate pros is a list of up to 3 strings
        pros = data.get("pros", [])
        if isinstance(pros, list):
            data["pros"] = [str(p) for p in pros[:3]]

        return data
    except json.JSONDecodeError as e:
        log(f"  JSON parse error: {e}")
        return None
    except anthropic.APIError as e:
        log(f"  Anthropic API error: {e}")
        return None
    except Exception as e:
        log(f"  Unexpected error calling Claude: {e}")
        return None
    finally:
        # Throttle every call (success or failure) to stay under the
        # Tier 1 Haiku RPM ceiling.  Cheap insurance against rate-limit
        # bursts when the workflow first warms up.
        time.sleep(PER_CALL_DELAY_S)


def save_summary(client: httpx.Client, listing_id: str, summary: dict) -> bool:
    r = client.patch(
        f"{REST_URL}/listings",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{listing_id}"},
        json={"ai_summary": json.dumps(summary, ensure_ascii=False)},
        timeout=15,
    )
    return r.status_code in (200, 204)


def main() -> None:
    log("BebKey AI summary generator starting")
    # max_retries=5 (default is 2): SDK does exponential backoff internally
    # on transient 429/5xx, so a brief rate-limit burst doesn't drop listings
    # — they're retried inside the SDK before we see the exception.
    ai_client = anthropic.Anthropic(api_key=ANTHROPIC_KEY, max_retries=5)

    with httpx.Client() as client:
        listings = fetch_listings(client)
        log(f"Found {len(listings)} listing(s) without ai_summary")

        success = 0
        failed  = 0

        for batch_start in range(0, len(listings), BATCH_SIZE):
            batch = listings[batch_start:batch_start + BATCH_SIZE]

            for listing in batch:
                listing_id = listing.get("id")
                city       = listing.get("city") or "?"

                prompt = build_prompt(listing)
                summary = call_claude(ai_client, prompt)

                if summary is None:
                    log(f"  SKIP {listing_id} ({city}) - Claude returned no valid JSON")
                    failed += 1
                    continue

                ok = save_summary(client, listing_id, summary)
                if ok:
                    log(f"  OK   {listing_id} ({city}) - tags: {summary.get('lifestyle_tags')}")
                    success += 1
                else:
                    log(f"  FAIL {listing_id} ({city}) - Supabase patch failed")
                    failed += 1

            # Delay between batches (not after the very last one)
            if batch_start + BATCH_SIZE < len(listings):
                time.sleep(BATCH_DELAY)

    log(f"DONE - {success} summaries saved, {failed} failed/skipped")


if __name__ == "__main__":
    main()
