"""
auto_refresh_fb_cookies.py — unattended Facebook cookie refresh (runs in CI).

Goal: keep FACEBOOK_COOKIES alive without you doing the manual
`refresh_fb_cookies.py` dance every few days.

Strategy (account-safety first — every extra login raises FB's suspicion):
  1. VALIDATE the current FACEBOOK_COOKIES. If the session is still alive,
     do nothing (no login → no risk). This is the common path.
  2. Only if the session is dead, LOG IN with FB_EMAIL / FB_PASSWORD through the
     residential proxy (same IL IP family the scrapers use), capture fresh
     cookies, and push them to the FACEBOOK_COOKIES secret.
  3. If FB throws a 2FA / checkpoint / CAPTCHA the script can't pass, it does
     NOT guess — it sends a Telegram alert so you run the manual refresh.

Required secrets (set in the GitHub repo):
  FACEBOOK_COOKIES                       current session (validated, then replaced)
  FB_EMAIL, FB_PASSWORD                  dummy account credentials (login fallback)
  GH_PAT                                 PAT with repo "secrets: write" (to update FACEBOOK_COOKIES)
  WEBSHARE_PROXY_HOST/USER/PASS          residential proxy (recommended)
  TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID   failure alerts (optional)

Run locally:  python scrapers/auto_refresh_fb_cookies.py   (needs gh auth or GH_PAT)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import urllib.request
import urllib.parse

REPO = "DoronZeltzer/BebKey"
SECRET = "FACEBOOK_COOKIES"
REQUIRED = {"xs", "c_user", "datr", "fr", "sb"}

FB_EMAIL = os.getenv("FB_EMAIL", "").strip()
FB_PASSWORD = os.getenv("FB_PASSWORD", "").strip()
COOKIES_JSON = os.getenv("FACEBOOK_COOKIES", "").strip()

WS_HOST = os.getenv("WEBSHARE_PROXY_HOST", "").strip()
WS_USER = os.getenv("WEBSHARE_PROXY_USER", "").strip()
WS_PASS = os.getenv("WEBSHARE_PROXY_PASS", "").strip()

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TG_CHAT = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36")


def log(msg: str) -> None:
    print(f"[fb-cookie-refresh] {msg}", flush=True)


def alert(msg: str) -> None:
    """Best-effort Telegram ping so you can do the manual refresh."""
    log(f"ALERT: {msg}")
    if not (TG_TOKEN and TG_CHAT):
        return
    try:
        data = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": f"🔑 BebKey FB cookies: {msg}"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data, timeout=15)
    except Exception as e:
        log(f"(telegram failed: {e})")


def proxy_cfg() -> dict | None:
    if WS_HOST and WS_USER and WS_PASS:
        return {"server": f"http://{WS_HOST}", "username": WS_USER, "password": WS_PASS}
    return None


def to_fb_cookies(raw: list[dict]) -> list[dict]:
    return [
        {
            "name": c["name"], "value": c["value"],
            "domain": c.get("domain", ".facebook.com"),
            "path": c.get("path", "/"),
            "secure": c.get("secure", True),
            "httpOnly": c.get("httpOnly", False),
        }
        for c in raw
        if "facebook.com" in (c.get("domain") or "")
    ]


def push_secret(payload: str) -> bool:
    """Update the FACEBOOK_COOKIES secret. Uses gh (GH_TOKEN=GH_PAT in CI)."""
    env = dict(os.environ)
    if os.getenv("GH_PAT"):
        env["GH_TOKEN"] = os.environ["GH_PAT"]
    proc = subprocess.run(
        ["gh", "secret", "set", SECRET, "--repo", REPO],
        input=payload, text=True, env=env,
    )
    return proc.returncode == 0


def main() -> int:
    if not COOKIES_JSON and not (FB_EMAIL and FB_PASSWORD):
        log("Nothing to do: no FACEBOOK_COOKIES and no FB_EMAIL/FB_PASSWORD.")
        return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright missing. pip install playwright && playwright install chromium")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, proxy=proxy_cfg(),
                                    args=["--disable-blink-features=AutomationControlled"])
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900}, locale="he-IL")
        ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>false});")
        page = ctx.new_page()

        # ── 1. Validate the existing session ────────────────────────────────
        if COOKIES_JSON:
            try:
                ctx.add_cookies(to_fb_cookies(json.loads(COOKIES_JSON)))
                page.goto("https://www.facebook.com/me", wait_until="domcontentloaded", timeout=60_000)
                time.sleep(3)
                url = page.url.lower()
                if "login" not in url and "checkpoint" not in url:
                    log("Current session is still valid - no refresh needed.")
                    browser.close()
                    return 0
                log("Current session is dead - attempting re-login.")
            except Exception as e:
                log(f"Validation error ({e}); attempting re-login.")

        # ── 2. Re-login with stored credentials ─────────────────────────────
        if not (FB_EMAIL and FB_PASSWORD):
            browser.close()
            alert("session expired and FB_EMAIL/FB_PASSWORD not set - run refresh_fb_cookies.py manually.")
            return 1

        try:
            ctx.clear_cookies()
            page.goto("https://www.facebook.com/login", wait_until="domcontentloaded", timeout=60_000)
            page.fill("input[name='email']", FB_EMAIL, timeout=20_000)
            page.fill("input[name='pass']", FB_PASSWORD, timeout=20_000)
            page.click("button[name='login']", timeout=20_000)
            page.wait_for_timeout(8000)
        except Exception as e:
            browser.close()
            alert(f"login form failed ({e}) - run refresh_fb_cookies.py manually.")
            return 1

        url = page.url.lower()
        names = {c["name"] for c in ctx.cookies()}
        if "checkpoint" in url or "two_factor" in url or "login" in url or not ({"c_user", "xs"} <= names):
            browser.close()
            reason = ("checkpoint/2FA" if ("checkpoint" in url or "two_factor" in url)
                      else "login not completed")
            alert(f"auto-login hit {reason} - FB needs a human. Run refresh_fb_cookies.py manually.")
            return 1

        fb = to_fb_cookies(ctx.cookies())
        browser.close()
        missing = REQUIRED - {c["name"] for c in fb}
        if missing:
            alert(f"logged in but missing cookies {sorted(missing)} - run manual refresh.")
            return 1

    payload = json.dumps(fb, ensure_ascii=False)
    if push_secret(payload):
        log(f"✓ Refreshed {SECRET} ({len(fb)} cookies).")
        return 0
    alert("got fresh cookies but failed to write the secret (check GH_PAT). Cookies not saved.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
