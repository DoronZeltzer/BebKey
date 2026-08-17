"""
BebKey - Refresh the neighborhood_stats materialised view.

Runs at the tail of every scraper pipeline so the Neighborhood Insights page
always shows current data.
"""

import os
import sys

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: missing Supabase env vars"); sys.exit(1)


def main() -> None:
    # PostgREST exposes an RPC for refreshing the view if defined.  Otherwise
    # we just call our helper SQL function.  Below we create it on first run.
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/refresh_neighborhood_stats"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }
    try:
        r = httpx.post(rpc_url, headers=headers, json={}, timeout=120)
        if r.status_code in (200, 204):
            print("[refresh_neighborhood_stats] OK")
            return
        # Function may not exist yet - print a friendly hint instead of
        # failing the whole pipeline.
        print(f"[refresh_neighborhood_stats] RPC returned {r.status_code}: {r.text[:200]}")
        print("[refresh_neighborhood_stats] Did you run "
              "supabase/add_price_history_and_deactivated_at.sql and "
              "supabase/add_refresh_neighborhood_stats_rpc.sql?")
    except Exception as e:
        print(f"[refresh_neighborhood_stats] exception: {e}")


if __name__ == "__main__":
    main()
