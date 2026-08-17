"""
BebKey - Master scraper runner
Runs Yad2 and Madlan IN PARALLEL via asyncio.gather.
Designed to be triggered by Railway cron (every 6 hours).
"""
import asyncio
import os
import sys
from datetime import datetime

# Defaults - overridden by Railway env vars
os.environ.setdefault("SCRAPER_MAX_PAGES", "10")
os.environ.setdefault("YAD2_MAX_PAGES", "8")
os.environ.setdefault("SCRAPER_CONCURRENCY", "3")

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

async def run_yad2():
    log("Starting Yad2 scraper...")
    try:
        import yad2_scraper
        await yad2_scraper.run()
        log("Yad2 scraper finished ✓")
    except Exception as e:
        log(f"Yad2 scraper ERROR: {e}")
        import traceback; log(traceback.format_exc())

async def run_madlan():
    log("Starting Madlan scraper...")
    try:
        import madlan_scraper
        await madlan_scraper.run()
        log("Madlan scraper finished ✓")
    except Exception as e:
        log(f"Madlan scraper ERROR: {e}")
        import traceback; log(traceback.format_exc())

async def main():
    log("=" * 60)
    log("BebKey scraper run started - running Yad2 + Madlan in parallel")

    # Run both scrapers concurrently
    await asyncio.gather(run_yad2(), run_madlan())

    log("=" * 60)
    log("All scrapers done ✓")

if __name__ == "__main__":
    asyncio.run(main())
