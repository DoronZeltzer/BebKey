"""
submit_indexnow.py - push freshly-changed bebkey.com URLs to Bing's IndexNow
endpoint (which also propagates to Yandex, Seznam, and Naver).

IndexNow is the modern replacement for sitemap-ping; instead of waiting for
the next Google/Bing crawl, you POST the URLs that changed and they get
indexed within minutes-to-hours.  Google itself doesn't accept IndexNow yet
(as of 2025) but adopts it via the BBC/sitemap discovery cascade - and
google submits its sitemaps to the bing/yahoo/duckduckgo indexes that DO.

How it works:
  1. We host /<KEY>.txt at https://www.bebkey.com/<KEY>.txt
     (already committed to public/, where Vercel serves static files)
  2. We POST { host, key, keyLocation, urlList } to api.indexnow.org
  3. Bing/Yandex/Seznam fetch /<KEY>.txt, verify the contents match the
     key in the POST, and then crawl every URL in urlList.

Reads the URL list from stdin (one per line) OR from a JSON summary
piped from generate_sitemap.py.

Env vars: none required (the key is hardcoded - it's public anyway).
"""
import json
import sys
import urllib.request
from urllib.error import URLError

KEY     = "f40f6a6a5bc04357b7edce4fdf0e6bfe"
HOST    = "www.bebkey.com"
ENDPOINT = "https://api.indexnow.org/IndexNow"
KEY_URL  = f"https://{HOST}/{KEY}.txt"

# Bing has a 10,000-URL-per-request limit; we stay well under
BATCH = 1000


def post_batch(urls: list[str]) -> tuple[int, str]:
    if not urls:
        return 0, "no urls"
    body = json.dumps({
        "host":        HOST,
        "key":         KEY,
        "keyLocation": KEY_URL,
        "urlList":     urls,
    }).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", errors="replace")[:500]
    except URLError as e:
        return -1, f"network error: {e}"


def collect_urls() -> list[str]:
    """Read URLs from stdin, accepting either:
       • one URL per line, OR
       • a JSON blob from generate_sitemap.py with a `landings` array
    """
    text = sys.stdin.read().strip()
    if not text:
        return []
    # Try JSON first
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and isinstance(obj.get("landings"), list):
            return [u for u in obj["landings"] if isinstance(u, str) and u.startswith("http")]
        if isinstance(obj, list):
            return [u for u in obj if isinstance(u, str) and u.startswith("http")]
    except json.JSONDecodeError:
        pass
    # Fall back to one-per-line
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip().startswith("http")
    ]


def main():
    urls = collect_urls()
    # Always seed with the homepage + sitemap so the index gets a fresh
    # discovery signal even if nothing else changed this week.
    seed = [
        f"https://{HOST}/",
        f"https://{HOST}/sitemap.xml",
        f"https://{HOST}/search",
        f"https://{HOST}/blog",
    ]
    urls = list(dict.fromkeys(seed + urls))  # dedup, keep order

    print(f"[indexnow] submitting {len(urls)} URLs in batches of {BATCH}")
    ok = 0
    for i in range(0, len(urls), BATCH):
        batch = urls[i:i + BATCH]
        status, body = post_batch(batch)
        print(f"  batch {i // BATCH + 1}: status={status}  size={len(batch)}  resp={body[:160]}")
        if 200 <= status < 300:
            ok += len(batch)
        # Bing accepts 200 / 202 silently - even an empty 200 means "queued"


    print(f"[indexnow] submitted {ok}/{len(urls)} URLs successfully")
    # Exit success unless EVERYTHING failed
    sys.exit(0 if ok > 0 else 1)


if __name__ == "__main__":
    main()
