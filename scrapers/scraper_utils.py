"""
BebKey - Shared scraper utilities.

Provides the building blocks used by every HTTP-based scraper:

  default_browser_headers - fresh browser-like headers with a random modern UA
  pick_user_agent         - pick one UA at random from the modern pool
  get_with_retry          - async GET with exponential backoff on 5xx, network
                            errors AND bot-block status codes (403 / 429 / 451).
                            Rotates the User-Agent between retries.
  supabase_upsert         - batch upsert to the listings table
  preload_existing        - load already-known source_url (or source_id) values

Usage
-----
    from scraper_utils import (
        get_with_retry, supabase_upsert, preload_existing,
        default_browser_headers,
    )
"""

import asyncio
import json
import random
from typing import Callable

import httpx


# ---------------------------------------------------------------------------
# Circuit breaker  (use inside per-page scrape loops)
# ---------------------------------------------------------------------------
#
# When a target site is having a bad day (slow / down / partial outage),
# every page fetch times out.  Without a circuit breaker the scraper grinds
# through all MAX_PAGES × retries × timeout-per-attempt seconds for nothing -
# e.g. a scraper's 25 pages × 2 categories × 3 retries × 30s = up to 75 minutes
# of dead time per scraper.
#
# Usage pattern inside a scrape_category loop:
#
#     breaker = CircuitBreaker(threshold=5, name="Janglo")
#     for page_num in range(1, MAX_PAGES + 1):
#         if breaker.tripped:
#             log(breaker.trip_message())
#             break
#         try:
#             r = await get_with_retry(client, url, log, timeout=15)
#             if r.status_code != 200:
#                 breaker.record_failure()
#                 continue
#             breaker.record_success()
#             # ... parse / save
#         except Exception:
#             breaker.record_failure()
#             continue
#
class CircuitBreaker:
    """Track consecutive failures.  After *threshold* in a row, trip - the
    caller should `break` out of its scrape loop instead of continuing to
    burn CI minutes on a site that clearly isn't responding."""

    __slots__ = ("threshold", "name", "consecutive_failures", "total_failures",
                 "total_successes")

    def __init__(self, *, threshold: int = 5, name: str = ""):
        self.threshold = threshold
        self.name = name
        self.consecutive_failures = 0
        self.total_failures = 0
        self.total_successes = 0

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.total_successes += 1

    def record_failure(self) -> None:
        self.consecutive_failures += 1
        self.total_failures += 1

    @property
    def tripped(self) -> bool:
        return self.consecutive_failures >= self.threshold

    def trip_message(self) -> str:
        tag = f" [{self.name}]" if self.name else ""
        return (
            f"  ⚡ Circuit breaker tripped{tag}: "
            f"{self.consecutive_failures} consecutive failures, "
            f"{self.total_successes} successful fetches earlier this run - "
            f"stopping early to save CI time."
        )


# ---------------------------------------------------------------------------
# Browser fingerprint pool  (May 2026)
# ---------------------------------------------------------------------------
# Every entry must be a UA string for Chrome / Edge / Firefox >= 2025 stable.
# Out-of-date UAs (Chrome <130) are the #1 cause of bot-block 403s on
# Israeli real-estate sites (Yad2, Madlan, Komo, Janglo, OnMap).

MODERN_USER_AGENTS: list[str] = [
    # Chrome 137 - Windows 10/11
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    # Chrome 137 - macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    # Chrome 136 - Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    # Edge 137 - Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0",
    # Firefox 138 - Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) "
    "Gecko/20100101 Firefox/138.0",
    # Firefox 137 - macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) "
    "Gecko/20100101 Firefox/137.0",
]

# Status codes that indicate a bot-block (NOT a real server problem).
# We retry these like 5xx, but rotate the User-Agent first.
BOT_BLOCK_STATUS_CODES: frozenset[int] = frozenset({403, 429, 451})


def pick_user_agent() -> str:
    """Return a random User-Agent from the modern pool."""
    return random.choice(MODERN_USER_AGENTS)


def default_browser_headers(
    *,
    referer: str | None = None,
    accept_language: str = "he-IL,he;q=0.9,en;q=0.8,en-US;q=0.7",
    json_response: bool = False,
    origin: str | None = None,
) -> dict[str, str]:
    """
    Build a fresh set of browser-like headers with a random modern UA.

    Pass the result to ``httpx.AsyncClient(headers=...)`` when constructing
    your client.  The UA is chosen at module-import time per call, so each
    new client gets its own fingerprint.

    Parameters
    ----------
    referer
        Optional Referer header - should be the site root URL.
    accept_language
        Default is Hebrew-first.  Pass ``"en-US,en;q=0.9"`` for Anglo sites
        (Janglo, Jerusalem Post, OnMap-EN).
    json_response
        Set True for API endpoints that return JSON (e.g. gw.yad2.co.il).
        Adjusts ``Accept`` and ``Sec-Fetch-Dest`` accordingly.
    origin
        Optional Origin header - needed for cross-origin XHR API calls.
    """
    ua = pick_user_agent()
    is_firefox = "Firefox" in ua
    is_mac = "Macintosh" in ua
    is_linux = "Linux" in ua and "Android" not in ua

    headers: dict[str, str] = {
        "User-Agent": ua,
        "Accept": (
            "application/json, text/plain, */*"
            if json_response else
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": accept_language,
        # NOTE: do NOT advertise "br" (Brotli). httpx only decodes Brotli when the
        # optional `brotli` package is installed (it isn't in requirements), so a
        # server that honours "br" (e.g. OnMap behind Cloudflare) returns
        # undecodable bytes → parsers find nothing (this silently broke OnMap:
        # ~1,963 parse_none). gzip/deflate are always decoded by httpx.
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "DNT": "1",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    if not json_response:
        headers["Upgrade-Insecure-Requests"] = "1"
        headers["Sec-Fetch-Dest"] = "document"
        headers["Sec-Fetch-Mode"] = "navigate"
        headers["Sec-Fetch-Site"] = "same-origin" if referer else "none"
        headers["Sec-Fetch-User"] = "?1"
    else:
        headers["Sec-Fetch-Dest"] = "empty"
        headers["Sec-Fetch-Mode"] = "cors"
        headers["Sec-Fetch-Site"] = "same-site"

    # Client-hints (Sec-CH-UA) are Chromium-only - Firefox does NOT send them.
    if not is_firefox:
        try:
            chrome_ver = ua.split("Chrome/")[1].split(".")[0]
        except IndexError:
            chrome_ver = "137"
        platform = '"macOS"' if is_mac else ('"Linux"' if is_linux else '"Windows"')
        headers["sec-ch-ua"] = (
            f'"Chromium";v="{chrome_ver}", '
            f'"Not=A?Brand";v="24", '
            f'"Google Chrome";v="{chrome_ver}"'
        )
        headers["sec-ch-ua-mobile"] = "?0"
        headers["sec-ch-ua-platform"] = platform

    if referer:
        headers["Referer"] = referer
    if origin:
        headers["Origin"] = origin

    return headers


# ---------------------------------------------------------------------------
# HTTP with exponential-backoff retry + UA rotation on bot-block
# ---------------------------------------------------------------------------

async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    log: Callable[[str], None],
    *,
    retries: int = 3,
    backoff: float = 1.0,
    **kwargs,
) -> httpx.Response:
    """
    Perform an async GET, retrying up to *retries* times on:
      - httpx network errors  (timeout / connect / protocol / read)
      - HTTP 5xx              (server-side transient failures)
      - HTTP 403 / 429 / 451  (bot-block - rotate UA before retrying)

    Backoff schedule (seconds):  backoff × 3^attempt  + uniform-jitter(0, 1.5)
      attempt 0 → immediate
      attempt 1 → ~1 s
      attempt 2 → ~3 s
      attempt 3 → ~9 s

    On bot-block status codes the User-Agent is hot-swapped from
    :data:`MODERN_USER_AGENTS` and merged into the per-request headers so
    the next attempt looks like a different browser.  This is sufficient
    to bypass Akamai / Cloudflare / PerimeterX fingerprint blocklists for
    sites that don't also IP-rate-limit.

    On exhaustion the last exception is re-raised (or the last error
    response is returned if there was no exception).
    """
    last_exc: Exception | None = None
    last_resp: httpx.Response | None = None

    for attempt in range(retries):
        try:
            r = await client.get(url, **kwargs)

            # ── Bot-block: rotate UA and retry as if it were a transient 5xx ──
            if r.status_code in BOT_BLOCK_STATUS_CODES:
                last_resp = r
                if attempt < retries - 1:
                    new_ua = pick_user_agent()
                    merged = dict(kwargs.get("headers") or {})
                    merged["User-Agent"] = new_ua
                    # Update sec-ch-ua to match the new UA (else fingerprint mismatch)
                    if "Firefox" not in new_ua:
                        try:
                            v = new_ua.split("Chrome/")[1].split(".")[0]
                            merged["sec-ch-ua"] = (
                                f'"Chromium";v="{v}", '
                                f'"Not=A?Brand";v="24", '
                                f'"Google Chrome";v="{v}"'
                            )
                        except IndexError:
                            pass
                    else:
                        # Firefox: strip client hints so the request looks consistent
                        for h in ("sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"):
                            merged.pop(h, None)
                    kwargs["headers"] = merged

                    wait = backoff * (3 ** attempt) + random.uniform(0, 1.5)
                    log(
                        f"  ↻ {url[:80]} → HTTP {r.status_code} (bot-block), "
                        f"rotating UA, retry {attempt + 1}/{retries - 1} "
                        f"in {wait:.1f}s"
                    )
                    await asyncio.sleep(wait)
                    continue
                return r

            # ── Success (or non-retriable client error) ──
            if r.status_code < 500:
                return r

            # ── 5xx: retry as before ──
            last_resp = r
            if attempt < retries - 1:
                wait = backoff * (3 ** attempt) + random.uniform(0, 1.0)
                log(
                    f"  ↻ {url[:80]} → HTTP {r.status_code}, "
                    f"retry {attempt + 1}/{retries - 1} in {wait:.1f}s"
                )
                await asyncio.sleep(wait)

        except (
            httpx.TimeoutException,
            httpx.ConnectError,
            httpx.RemoteProtocolError,
            httpx.ReadError,
        ) as exc:
            last_exc = exc
            if attempt < retries - 1:
                wait = backoff * (3 ** attempt) + random.uniform(0, 1.0)
                log(
                    f"  ↻ {url[:80]} → {type(exc).__name__}: {exc}, "
                    f"retry {attempt + 1}/{retries - 1} in {wait:.1f}s"
                )
                await asyncio.sleep(wait)

    if last_exc is not None:
        raise last_exc
    return last_resp  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

async def supabase_upsert(
    client: httpx.AsyncClient,
    rest_url: str,
    sb_headers: dict,
    rows: list[dict],
    log: Callable[[str], None],
    enrich_fn: Callable | None = None,
) -> int:
    """
    Upsert *rows* into the listings table.

    *enrich_fn* (optional) is called on each row before upload - pass the
    ``enrich`` function from ``quality.py`` to attach quality_score / has_image.

    Returns the number of rows successfully upserted (0 on error).

    Note on *client*: kept for backward compatibility but unused.  Supabase
    rejects service-role keys sent from requests that look browser-y
    (Mozilla UA + sec-ch-ua + Sec-Fetch-*).  Site scrapers carry exactly
    those headers, so we always do the REST call through a fresh
    httpx.AsyncClient that has only the Python-default User-Agent.
    """
    if not rows:
        return 0
    if enrich_fn is not None:
        for row in rows:
            enrich_fn(row)
    try:
        async with httpx.AsyncClient(timeout=30) as sb:
            r = await sb.post(
                # on_conflict=source_url tells PostgREST to merge on the
                # listings_source_url_unique constraint, not the PK.  Without
                # this, any rerun would 23505 on the first existing URL and
                # drop the whole batch ("0 new of 1500 raw" bug).
                f"{rest_url}/listings?on_conflict=source_url",
                headers=sb_headers,
                content=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
            )
        if r.status_code in (200, 201):
            return len(rows)
        log(f"  ⚠ Supabase upsert {r.status_code}: {r.text[:200]}")
    except Exception as exc:
        log(f"  ⚠ Supabase upsert error: {exc}")
    return 0


async def preload_existing(
    client: httpx.AsyncClient,
    rest_url: str,
    sb_headers: dict,
    source: str,
    log: Callable[[str], None],
    field: str = "source_url",
) -> set[str]:
    """
    Return a set of already-stored *field* values for *source* so scrapers
    can skip re-inserting duplicates without hitting the DB on every row.

    *field* is usually ``"source_url"`` but can be ``"source_id"`` for
    sources (e.g. Telegram) where source_id is the natural dedup key.

    See :func:`supabase_upsert` for why we ignore *client* and use a
    fresh httpx client for the REST call.
    """
    existing: set[str] = set()
    offset, limit = 0, 1000

    async with httpx.AsyncClient(timeout=30) as sb:
        while True:
            try:
                r = await sb.get(
                    f"{rest_url}/listings",
                    headers={**sb_headers, "Prefer": ""},
                    params={
                        "select":     field,
                        "source":     f"eq.{source}",
                        "is_active":  "eq.true",
                        "limit":      limit,
                        "offset":     offset,
                    },
                )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                for row in rows:
                    val = row.get(field)
                    if val:
                        existing.add(val)
                if len(rows) < limit:
                    break
                offset += limit
            except Exception as exc:
                log(f"Preload error: {exc}")
                break

    log(f"Preloaded {len(existing)} existing {source} {field}s")
    return existing
