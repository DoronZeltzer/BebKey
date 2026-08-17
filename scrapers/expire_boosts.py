"""
expire_boosts.py — clear lapsed listing boosts so display + sort stay correct.

Runs daily (folded into the cheap scrape pipeline; no separate workflow, so it
adds ~no CI minutes). Uses the Supabase service-role key.

  - Featured: turn off is_featured once featured_until has passed (so the search
    "featured first" sort no longer lifts it).
  - Bump: null bump_until once it passes (the search re-float sort orders by
    bump_until, so lapsed bumps must be cleared to stop ranking up).
  - Spotlight / tag: display already checks `*_until > now`, but we tidy the
    columns too so the data stays clean.
"""
import os
import sys
import datetime
import httpx

URL = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/") + "/rest/v1"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not KEY or not URL.startswith("http"):
    sys.exit("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
NOW = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def patch(query: str, body: dict) -> None:
    try:
        r = httpx.patch(f"{URL}/listings?{query}", headers=H, json=body, timeout=60)
        print(f"[expire_boosts] {query} -> {r.status_code}", flush=True)
    except Exception as e:
        print(f"[expire_boosts] {query} -> ERROR {e}", flush=True)


def main() -> None:
    patch(f"featured_until=lt.{NOW}&is_featured=eq.true", {"is_featured": False})
    patch(f"bump_until=lt.{NOW}", {"bump_until": None})
    patch(f"spotlight_until=lt.{NOW}", {"spotlight_until": None})
    patch(f"tag_until=lt.{NOW}", {"tag_kind": None, "tag_until": None})
    print("[expire_boosts] done", flush=True)


if __name__ == "__main__":
    main()
