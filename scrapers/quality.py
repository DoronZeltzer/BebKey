"""
BebKey - quality_score / has_image computation shared across all scrapers.

Both fields are now PostgreSQL `GENERATED ALWAYS` columns on the listings
table (see supabase/update_quality_score.sql) - the database computes them
automatically on every insert/update from `images`, `price`, `city`,
`rooms`, `size_m2`, and `description`.  Scrapers MUST NOT supply values
for these columns or every upsert returns 400 "cannot insert a non-DEFAULT
value into column".

`enrich()` is kept for backward compatibility (still called by every
scraper as `enrich(row)` before upsert) but is now a no-op.  The reference
formula below is the same one encoded in the GENERATED ALWAYS expression
- keep them in sync if you ever change the weights.

Formula (max 10) reference, mirrored in update_quality_score.sql:
  Images bucket (0-5 pts):
    ≥5 imgs → 5 | ≥3 → 4 | ≥1 → 3 | 0 → 0

  Completeness (0-5 pts):
    price present          → +2  (essential for search/filtering)
    city present           → +1  (essential for location filtering)
    rooms present          → +1  (main bedroom filter)
    size_m2 OR desc>50ch   → +1  (at least one detail present)
"""


def enrich(row: dict) -> dict:
    """
    No-op kept for backward compatibility - quality_score and has_image are
    GENERATED ALWAYS columns now and must not be supplied by the client.

    Also defensively strips them from `row` in case an upstream caller
    pre-populated either field (e.g. an Apify actor output mapped onto
    the listings shape).
    """
    row.pop("quality_score", None)
    row.pop("has_image", None)
    return row
