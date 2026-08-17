"""
tg_probe_channels.py - verify which Telegram channels in the scraper's
default list actually resolve, and how many messages they post.

Run this locally (uses TELEGRAM_API_ID / TELEGRAM_API_HASH /
TELEGRAM_SESSION from .env or env vars).  Output is a table you can
paste back into the conversation, e.g.:

    @dirot4rent           OK   42 msgs in last 7d
    @nadlanil             OK    3 msgs in last 7d
    @dirot_telaviv        DEAD No user has dirot_telaviv as username
    @nedvizhimost_israel  OK   18 msgs in last 7d

The default channel list is imported from telegram_scraper.py so this
stays in sync.  Channels marked DEAD can be removed (or just left in
- the scraper soft-fails them).
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

# Make scrapers/ importable
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scrapers"))

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(HERE, "..", ".env"))

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
except ImportError:
    print("ERROR: telethon not installed.  Run: pip install telethon")
    sys.exit(1)

# Import the channel list from the scraper itself so they stay in sync
from telegram_scraper import _DEFAULT_CHANNELS  # type: ignore

TG_API_ID   = os.getenv("TELEGRAM_API_ID", "")
TG_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
TG_SESSION  = os.getenv("TELEGRAM_SESSION", "")

LOOKBACK_HOURS = int(os.getenv("PROBE_LOOKBACK_HOURS", "168"))  # 1 week

if not (TG_API_ID and TG_API_HASH and TG_SESSION):
    print("ERROR: set TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION")
    sys.exit(1)


async def probe(channel: str, client: TelegramClient) -> tuple[str, str]:
    """Return (status, detail) tuple for one channel."""
    try:
        entity = await client.get_entity(channel)
    except Exception as e:
        return ("DEAD", str(e)[:60])

    cutoff = datetime.now(timezone.utc).timestamp() - LOOKBACK_HOURS * 3600
    recent = 0
    total  = 0
    try:
        async for msg in client.iter_messages(entity, limit=200):
            total += 1
            if msg.date and msg.date.timestamp() >= cutoff:
                recent += 1
            else:
                break  # iter is newest-first; old msg = stop
    except Exception as e:
        return ("ERROR", str(e)[:60])

    return ("OK", f"{recent} msgs in last {LOOKBACK_HOURS}h (scanned {total})")


async def main():
    api_id = int(TG_API_ID)
    client = TelegramClient(StringSession(TG_SESSION), api_id, TG_API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("ERROR: session not authorised - regenerate it")
        return

    width = max(len(c) for c in _DEFAULT_CHANNELS) + 2
    print(f"Probing {len(_DEFAULT_CHANNELS)} channels (lookback {LOOKBACK_HOURS}h)\n")
    print(f"{'CHANNEL'.ljust(width)} STATUS  DETAIL")
    print("-" * (width + 70))

    live_count, dead_count = 0, 0
    live, dead = [], []

    for ch in _DEFAULT_CHANNELS:
        status, detail = await probe(ch, client)
        print(f"{ch.ljust(width)} {status:6}  {detail}")
        if status == "OK":
            live_count += 1
            live.append(ch)
        else:
            dead_count += 1
            dead.append(ch)
        await asyncio.sleep(1)  # be polite

    print()
    print(f"Summary: {live_count} live, {dead_count} dead/error")
    if dead:
        print("\nDead handles (safe to remove from _DEFAULT_CHANNELS):")
        for ch in dead:
            print(f"  {ch}")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
