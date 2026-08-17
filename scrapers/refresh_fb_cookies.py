"""
refresh_fb_cookies.py — one-command Facebook cookie refresh for the FB Groups scraper.

YOU run this on your own machine. It does NOT store your password and never logs in
for you: you log into Facebook yourself in the window it opens (Claude/automation
cannot enter FB credentials or pass FB's login/2FA/CAPTCHA checks). The script only
*reads* the cookies from the session YOU authenticated, validates them, and pushes
them to the FACEBOOK_COOKIES GitHub secret — replacing the manual Cookie-Editor
export + paste-into-GitHub steps in docs/FB_COOKIE_REFRESH.md.

Because it keeps a persistent browser profile (scrapers/.fb_profile, gitignored),
you only re-login when Facebook actually kills the session; otherwise re-running
this just re-exports fresh cookies with no login needed.

Usage:
    python scrapers/refresh_fb_cookies.py

One-time setup:
    pip install playwright
    playwright install chromium
    gh auth login        # must have repo access to DoronZeltzer/BebKey
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

PROFILE_DIR = Path(__file__).resolve().parent / ".fb_profile"
REPO = "DoronZeltzer/BebKey"
SECRET = "FACEBOOK_COOKIES"
REQUIRED = {"xs", "c_user", "datr", "fr", "sb"}
LOGIN_WAIT_SECONDS = 300  # 5 min for you to log in if needed


def main() -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright missing. Run:  pip install playwright && playwright install chromium")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto("https://m.facebook.com/", wait_until="domcontentloaded", timeout=60_000)
        except Exception as e:
            print(f"(navigation warning: {e})")

        print("\n" + "=" * 64)
        print("If a LOGIN page is showing, log in as the Hunter Steel account NOW.")
        print("(Handle any 2FA / 'is this you' prompt yourself in that window.)")
        print(f"Waiting up to {LOGIN_WAIT_SECONDS // 60} min for a logged-in session…")
        print("=" * 64 + "\n")

        deadline = time.time() + LOGIN_WAIT_SECONDS
        while time.time() < deadline:
            names = {c["name"] for c in ctx.cookies()}
            if {"c_user", "xs"} <= names:
                break
            time.sleep(2)

        cookies = ctx.cookies()
        names = {c["name"] for c in cookies}
        missing = REQUIRED - names
        if missing:
            ctx.close()
            sys.exit(f"\n✗ Not logged in / missing cookies {sorted(missing)}. "
                     "Secret NOT changed. Log in fully and re-run.")

        fb = [
            {
                "name": c["name"], "value": c["value"],
                "domain": c.get("domain", ".facebook.com"),
                "path": c.get("path", "/"),
                "secure": c.get("secure", True),
                "httpOnly": c.get("httpOnly", False),
            }
            for c in cookies
            if "facebook.com" in (c.get("domain") or "")
        ]
        ctx.close()

    payload = json.dumps(fb, ensure_ascii=False)
    print(f"Captured {len(fb)} Facebook cookies (incl. {sorted(REQUIRED & names)}).")

    # Push to the GitHub secret via stdin (so it never appears in argv / shell history).
    proc = subprocess.run(
        ["gh", "secret", "set", SECRET, "--repo", REPO],
        input=payload, text=True,
    )
    if proc.returncode == 0:
        print(f"\n✓ Updated {SECRET} on {REPO}.")
        print("  Verify:  gh workflow run fb-cookie-check.yml   (or tell Claude to run it)")
    else:
        print("\n✗ `gh secret set` failed — is gh authenticated with repo access? "
              "(gh auth status)")


if __name__ == "__main__":
    main()
