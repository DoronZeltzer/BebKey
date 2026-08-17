"""
BebKey - Hard delete inactive listings older than N days.

The daily deactivate_stale + dedup pipelines mark dead listings as
is_active=false but leave them in the DB.  Over time, the table grows
indefinitely with rows users never see.

This script PERMANENTLY DELETES rows where:
  - is_active = false
  - deactivated_at < (now - HARD_DELETE_AFTER_DAYS, default 60)
  - (falls back to scraped_at if deactivated_at is NULL - happens for very
     old inactive rows that pre-date the trigger.  Backfilled to NOW() once
     by the migration, so this branch is rarely taken.)

Recovery window: 60 days after deactivation.  After that they're gone.

Env vars:
  VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  HARD_DELETE_AFTER_DAYS (default 60)
  HARD_DELETE_BATCH      (default 500)
  HARD_DELETE_DRY_RUN    ("1" to only count, don't delete)
"""

import os
import sys
from datetime import datetime, timezone, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

LOG_FILE = os.path.join(os.path.dirname(__file__), "hard_delete_log.txt")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: missing Supabase env vars"); sys.exit(1)

DAYS_THRESHOLD = int(os.getenv("HARD_DELETE_AFTER_DAYS", "60"))
BATCH_SIZE     = int(os.getenv("HARD_DELETE_BATCH", "500"))
DRY_RUN        = os.getenv("HARD_DELETE_DRY_RUN", "") == "1"

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def main() -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=DAYS_THRESHOLD)).isoformat()

    log("=" * 60)
    log("BebKey hard-delete old inactive listings")
    log(f"Cutoff: scraped_at < {cutoff} (HARD_DELETE_AFTER_DAYS={DAYS_THRESHOLD})")
    log(f"Batch size: {BATCH_SIZE} | dry-run: {DRY_RUN}")
    log("=" * 60)

    # 1) Count first so the run logs are informative even on a dry run.
    with httpx.Client(timeout=60) as client:
        count_r = client.head(
            f"{REST_URL}/listings",
            headers={**SB_HEADERS, "Prefer": "count=exact"},
            params={
                "select":     "id",
                "is_active":  "eq.false",
                "deactivated_at": f"lt.{cutoff}",
            },
        )
        # PostgREST returns the count in the Content-Range header: "*/<n>"
        cr = count_r.headers.get("content-range", "*/0")
        try:
            total = int(cr.split("/")[-1])
        except ValueError:
            total = 0
        log(f"Eligible for deletion: {total} rows")

        if DRY_RUN:
            log("DRY-RUN mode - no rows will be deleted.  Done.")
            return
        if total == 0:
            log("Nothing to delete.  Done.")
            return

        # 2) Delete in batches.  PostgREST `DELETE` honours filter and limit.
        deleted_total = 0
        while deleted_total < total:
            # Fetch up to BATCH_SIZE candidate IDs first (DELETE with limit is
            # not portable across all PostgREST versions, so we delete by id list).
            ids_r = client.get(
                f"{REST_URL}/listings",
                headers={**SB_HEADERS, "Prefer": ""},
                params={
                    "select":     "id",
                    "is_active":  "eq.false",
                    "deactivated_at": f"lt.{cutoff}",
                    "limit":      BATCH_SIZE,
                },
            )
            if ids_r.status_code != 200:
                log(f"  ✗ list error {ids_r.status_code}: {ids_r.text[:200]}")
                break
            rows = ids_r.json()
            if not rows:
                break
            id_list = ",".join(f'"{r["id"]}"' for r in rows)

            del_r = client.delete(
                f"{REST_URL}/listings",
                headers=SB_HEADERS,
                params={"id": f"in.({id_list})"},
            )
            if del_r.status_code not in (200, 204):
                log(f"  ✗ delete error {del_r.status_code}: {del_r.text[:200]}")
                break

            deleted_total += len(rows)
            log(f"  · deleted {deleted_total}/{total}")

        log(f"DONE - hard-deleted {deleted_total} inactive listings")


if __name__ == "__main__":
    main()
