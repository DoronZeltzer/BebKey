"""
purge_ai_typography.py - one-off cleanup of AI-style Unicode chars
across the BebKey codebase.

Replaces en-dashes, ellipses, curly quotes, etc. with their plain ASCII
equivalents. Preserves locale files for foreign languages where those
chars are correct punctuation (Russian/French guillemets etc.).

Run from the project root: python scripts/purge_ai_typography.py
"""
from __future__ import annotations
import os
import sys

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SKIP_DIRS = {"node_modules", "dist", ".git", ".next", "build", "__pycache__"}
EXTS = (".tsx", ".ts", ".js", ".jsx", ".json", ".html",
        ".md", ".css", ".py", ".yml", ".yaml", ".sql")

# Replacements (Unicode char -> ASCII equivalent)
REPL = [
    ("-", "-"),    # en-dash      ->  hyphen
    ("...", "..."),  # ellipsis     ->  three periods
    ("-", "-"),    # minus sign   ->  hyphen
    ("'", "'"),    # curly apostrophe  ->  straight
    ("'", "'"),    # left single quote ->  straight
    (""", '"'),    # curly double open  -> straight
    (""", '"'),    # curly double close -> straight
]

# Files we DON'T touch - they hold correct foreign-language quotes
SKIP_FILES = {
    "src/locales/ru.json",   # Russian uses guillemets + curly quotes natively
    "src/locales/fr.json",   # French uses guillemets natively
    "src/locales/ar.json",   # Arabic
}


def normalise(path: str) -> str:
    p = path.replace("\\", "/")
    if p.startswith("./"):
        p = p[2:]
    return p


def main() -> None:
    total_changes = 0
    changed_files = 0

    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith(EXTS):
                continue
            path = os.path.join(root, fn)
            if normalise(path) in SKIP_FILES:
                continue
            try:
                with open(path, encoding="utf-8") as f:
                    text = f.read()
            except Exception:
                continue
            orig = text
            for old, new in REPL:
                text = text.replace(old, new)
            if text != orig:
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(text)
                diff = sum(orig.count(o) - text.count(o) for o, _ in REPL)
                total_changes += diff
                changed_files += 1

    print(f"Changed {changed_files} files, replaced {total_changes} chars.")

    # Verification pass
    print("\nRemaining counts (non-locale files):")
    for label, ch in [
        ("em-dash",     "—"),
        ("en-dash",     "-"),
        ("ellipsis",    "..."),
        ("minus",       "-"),
        ("curly apos",  "'"),
        ("curly quote", """),
        ("micro u",     "µ"),
    ]:
        n = 0
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in files:
                if not fn.endswith(EXTS):
                    continue
                path = os.path.join(root, fn)
                if normalise(path) in SKIP_FILES:
                    continue
                try:
                    with open(path, encoding="utf-8") as f:
                        n += f.read().count(ch)
                except Exception:
                    pass
        print(f"  {label:14}  {n}")


if __name__ == "__main__":
    main()
