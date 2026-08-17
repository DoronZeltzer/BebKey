"""
generate_telegram_session.py - one-time helper to mint a TELEGRAM_SESSION
string for the Telegram scraper.

Run this **locally on your machine** (not in CI), once.  It will:
  1. Prompt for your Telegram API ID and API hash (from my.telegram.org/apps)
  2. Prompt for your phone number
  3. Ask Telegram to send a verification code to that number
  4. Prompt for the code (delivered via the Telegram app or SMS)
  5. If you have 2FA enabled, prompt for the 2FA password
  6. Print the StringSession - paste this into GitHub Secrets as
     TELEGRAM_SESSION (and the API_ID / API_HASH as their own secrets)

After this runs successfully once, the scraper can read 30+ Israeli
real-estate Telegram channels every scraper run, automatically.

Requirements:
    pip install telethon
"""
import asyncio
import sys

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
except ImportError:
    print("ERROR: telethon not installed.  Run: pip install telethon")
    sys.exit(1)


def prompt(label: str, *, secret: bool = False) -> str:
    if secret:
        import getpass
        val = getpass.getpass(label).strip()
    else:
        val = input(label).strip()
    if not val:
        print("(empty input - aborting)")
        sys.exit(1)
    return val


async def main():
    print("=" * 70)
    print("BebKey - Telegram session generator")
    print("=" * 70)
    print()
    print("Step 1.  Get your API credentials")
    print("--------")
    print("If you haven't yet, open https://my.telegram.org/apps in your")
    print("browser and log in with your phone number.  Then:")
    print("  • Click 'API development tools'")
    print("  • Create an app (any name, e.g. 'BebKey scraper')")
    print("  • Copy the api_id (an integer) and api_hash (a 32-char string)")
    print()

    api_id   = int(prompt("Paste your api_id (integer):  "))
    api_hash = prompt("Paste your api_hash (32 chars): ")

    print()
    print("Step 2.  Authenticate (one-time)")
    print("--------")
    print("Telegram will send a login code to the Telegram app on your")
    print("phone (or SMS if you don't have the app open).  You'll enter")
    print("that code on the next prompt.")
    print()

    async with TelegramClient(StringSession(), api_id, api_hash) as client:
        # The client context manager triggers the auth flow on first run -
        # it will interactively prompt for the phone number, then the code,
        # then optionally the 2FA password.

        me = await client.get_me()
        session_str = client.session.save()

        print()
        print("=" * 70)
        print("SUCCESS - logged in as", me.first_name or "(no name)", me.username and f"@{me.username}" or "")
        print("=" * 70)
        print()
        print("Your TELEGRAM_SESSION string is below.  Copy the whole line")
        print("(no quotes) and paste it into GitHub Secrets.")
        print()
        print(session_str)
        print()
        print("Then add these three secrets to GitHub:")
        print("  github.com/DoronZeltzer/BebKey/settings/secrets/actions")
        print()
        print(f"  TELEGRAM_API_ID    = {api_id}")
        print(f"  TELEGRAM_API_HASH  = {api_hash}")
        print(f"  TELEGRAM_SESSION   = (the long string above)")
        print()


if __name__ == "__main__":
    asyncio.run(main())
