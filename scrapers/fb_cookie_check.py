"""
BebKey — Facebook cookie validity check.

Stripped-down version of facebook_groups_scraper.py that ONLY does the
session check, so we can verify FACEBOOK_COOKIES without waiting an hour
for the full scraper pipeline.

Reads FACEBOOK_COOKIES env var (JSON array), injects into a Playwright
mobile-Safari context, navigates to m.facebook.com, and prints VALID /
INVALID.  Exits 0 either way (signal is in stdout, not exit code) so a
non-zero exit means "the check itself crashed" rather than "cookies bad".
"""

import asyncio
import json
import os
import sys

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright


COOKIES_RAW   = os.getenv("FACEBOOK_COOKIES", "").strip()
WS_PROXY_HOST = os.getenv("WEBSHARE_PROXY_HOST", "").strip()
WS_PROXY_USER = os.getenv("WEBSHARE_PROXY_USER", "").strip()
WS_PROXY_PASS = os.getenv("WEBSHARE_PROXY_PASS", "").strip()
# SKIP_PROXY=1 forces a direct connection so we can tell apart "proxy is
# broken" from "cookies are bad" when the session check times out.
SKIP_PROXY    = os.getenv("SKIP_PROXY", "").strip() in ("1", "true", "yes")


def parse_cookies(raw: str) -> list[dict]:
    if not raw:
        print("ERROR: FACEBOOK_COOKIES env var not set")
        sys.exit(2)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: FACEBOOK_COOKIES is not valid JSON: {e}")
        sys.exit(2)
    if not isinstance(data, list):
        print("ERROR: FACEBOOK_COOKIES must be a JSON array of cookie objects")
        sys.exit(2)
    return data


async def main() -> None:
    cookies = parse_cookies(COOKIES_RAW)
    cookie_names = sorted({c.get("name", "?") for c in cookies})
    print(f"Loaded {len(cookies)} cookies: {', '.join(cookie_names)}")

    # The xs cookie is FB's session token.  Without it, you're not logged in
    # no matter how many other cookies are present.  Flag this early so a
    # missing xs doesn't look like a generic "session expired".
    has_xs     = any(c.get("name") == "xs"     for c in cookies)
    has_c_user = any(c.get("name") == "c_user" for c in cookies)
    if not has_xs:
        print("WARN: 'xs' cookie missing — this is the actual session token. "
              "Cookie-Editor 'Export → JSON' includes it; the cookieStore.getAll() "
              "trick does not.")
    if not has_c_user:
        print("WARN: 'c_user' cookie missing — this is the FB user id. "
              "Session will be rejected without it.")

    pw_cookies = []
    for c in cookies:
        try:
            pw_cookies.append({
                "name":     c["name"],
                "value":    c["value"],
                "domain":   c.get("domain", ".facebook.com"),
                "path":     c.get("path", "/"),
                "secure":   c.get("secure", True),
                "httpOnly": c.get("httpOnly", False),
            })
        except (KeyError, TypeError):
            pass

    launch_kwargs = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    }
    # Match the real scraper: same Webshare residential IL proxy so FB sees the
    # same exit-IP it'll see when the actual scraper runs.  If Webshare creds
    # aren't set we just go direct (CI IPs sometimes work, sometimes don't).
    has_ws = WS_PROXY_HOST and WS_PROXY_USER and WS_PROXY_PASS
    if has_ws and not SKIP_PROXY:
        launch_kwargs["proxy"] = {
            "server":   f"http://{WS_PROXY_HOST}",
            "username": WS_PROXY_USER,
            "password": WS_PROXY_PASS,
        }
        print("Using Webshare residential proxy (IL, sticky) — matches the real scraper")
    elif SKIP_PROXY:
        print("SKIP_PROXY=1 — going direct from CI to test cookies w/o proxy")
    else:
        print("WEBSHARE_PROXY_* not set — going direct (real scraper uses proxy)")

    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_kwargs)
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 "
                "Mobile/15E148 Safari/604.1"
            ),
            viewport={"width": 390, "height": 844},
            locale="he-IL",
        )
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        """)
        await ctx.add_cookies(pw_cookies)
        print(f"Injected {len(pw_cookies)} cookies into browser context")

        page = await ctx.new_page()
        try:
            await page.goto("https://m.facebook.com/",
                            timeout=60_000, wait_until="domcontentloaded")
            await asyncio.sleep(3)
            url   = page.url
            title = await page.title()
            print(f"Landed at: {url}")
            print(f"Page title: {title!r}")

            if "login" in url.lower() or "Log in" in title or "כניסה" in title:
                print("RESULT: INVALID — redirected to login page")
            else:
                print("RESULT: VALID — Facebook accepted the session")
        except Exception as e:
            print(f"RESULT: ERROR — {type(e).__name__}: {e}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
