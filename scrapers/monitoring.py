"""
BebKey - Shared monitoring helpers.

Provides:
  init_sentry()  - call once at scraper start; no-op if SENTRY_DSN is missing
  ping_dead_man(name)  - POST to a Better-Stack-style heartbeat URL after a
                         successful run, so an alarm fires if a scraper goes
                         silent for >24h.  No-op if no URL configured.

Both helpers are intentionally best-effort - they never raise.
"""

import os
from typing import Optional


def init_sentry(component: Optional[str] = None) -> None:
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENV", "production"),
            traces_sample_rate=0.05,
            send_default_pii=False,
        )
        if component:
            sentry_sdk.set_tag("component", component)
    except Exception:
        # Never let a monitoring failure take down a scrape run.
        pass


def ping_dead_man(scraper_name: str) -> None:
    """
    Hit a heartbeat URL after a successful scrape.  Configure with one of:
      DEAD_MAN_<NAME>_URL   (per-scraper override)
      DEAD_MAN_BASE_URL     (with /{name} appended)
    No-op if neither is set.
    """
    url = (
        os.getenv(f"DEAD_MAN_{scraper_name.upper()}_URL")
        or (os.getenv("DEAD_MAN_BASE_URL", "").rstrip("/") + "/" + scraper_name
            if os.getenv("DEAD_MAN_BASE_URL") else "")
    )
    if not url:
        return
    try:
        import httpx
        httpx.get(url, timeout=5)
    except Exception:
        pass
