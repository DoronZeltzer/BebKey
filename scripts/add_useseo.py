"""
Add useSeo() calls to public pages that don't have any.

For each target page:
  1. Inject `import { useSeo } from '../hooks/useSeo'` if not already there.
  2. Find the default-exported component function `export default function X(...)`
     and insert a `useSeo({ title, description })` call as the first statement
     in its body.

Idempotent: re-running is a no-op for pages that already have useSeo.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / "src" / "pages"

# Page → (title, description) seed values.
# Keep titles short and consistent - useSeo adds "| BebKey" automatically.
PAGE_SEO = {
    "Contact.tsx":       ("Contact",
                          "Get in touch with the BebKey team. We respond within 1-2 business days."),
    "Help.tsx":          ("Help & FAQ",
                          "Answers to common questions about searching, listings, saved searches, agent accounts, and payments on BebKey."),
    "Login.tsx":         ("Sign in",
                          "Sign in to BebKey to access your saved listings, search alerts, and agent dashboard."),
    "Register.tsx":      ("Create account",
                          "Create a free BebKey account to save listings, set up search alerts, and contact agents."),
    "Privacy.tsx":       ("Privacy Policy",
                          "How BebKey collects, uses, and protects your personal information."),
    "Terms.tsx":         ("Terms of Service",
                          "Terms governing your use of BebKey - buyers, sellers, agents, and visitors."),
    "Refund.tsx":        ("Refund Policy",
                          "Refund and cancellation policy for BebKey subscriptions and one-off listing fees."),
    "Accessibility.tsx": ("Accessibility Statement",
                          "BebKey's accessibility commitment under Israeli Standard IS 5568 and WCAG 2.1 AA, including known limitations and contact channels."),
    "NotFound.tsx":      ("Page not found",
                          "Sorry, the page you were looking for couldn't be found on BebKey."),
    "Submit.tsx":        ("Submit a listing",
                          "List your property on BebKey - reach buyers and renters across Israel."),
    "Dashboard.tsx":     ("Dashboard",
                          "Your BebKey dashboard - manage clients, listings, and search alerts."),
    "Profile.tsx":       ("Profile",
                          "Manage your BebKey profile, language, and notification preferences."),
}

IMPORT_LINE = "import { useSeo } from '../hooks/useSeo'"

def patch_file(path: Path, title: str, description: str) -> str:
    src = path.read_text(encoding="utf-8")
    if "useSeo" in src:
        return "skip (already has useSeo)"

    # 1. Inject import after the last existing import line.
    lines = src.split("\n")
    last_import = -1
    for i, l in enumerate(lines):
        if l.startswith("import "):
            last_import = i
    if last_import < 0:
        return "skip (no imports found?)"
    lines.insert(last_import + 1, IMPORT_LINE)
    src = "\n".join(lines)

    # 2. Find the default-exported component function and insert useSeo() at
    # the start of its body.  Pattern: "export default function X(...) {"
    # We need to handle pages where the function takes destructured props too.
    m = re.search(r"export default function\s+\w+\s*\([^)]*\)\s*\{", src)
    if not m:
        return "skip (no exported function)"
    insert_at = m.end()
    # Use double quotes so apostrophes inside the string don't need escaping.
    # JS strings allow either; double quotes keep "BebKey's ..." readable.
    snippet = (
        f"\n  useSeo({{\n"
        f"    title: \"{title}\",\n"
        f"    description: \"{description}\",\n"
        f"  }})"
    )
    src = src[:insert_at] + snippet + src[insert_at:]
    path.write_text(src, encoding="utf-8")
    return "ok"


def main():
    for name, (title, desc) in PAGE_SEO.items():
        p = PAGES / name
        if not p.exists():
            print(f"  ! {name} not found")
            continue
        result = patch_file(p, title, desc)
        print(f"  {result:<35} {name}")


if __name__ == "__main__":
    main()
