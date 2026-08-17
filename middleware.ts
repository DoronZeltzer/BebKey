/**
 * BebKey — Bot prerendering (dynamic rendering) — Vercel Edge Middleware.
 *
 * WHY THIS EXISTS
 * ───────────────
 * BebKey is a Vite + React SPA. `vercel.json` rewrites every route to
 * /index.html, so a crawler that does NOT execute JavaScript receives the
 * homepage shell — same <title>/<meta> on /, /listing/:id, /rent/in/:city, …
 * Google can JS-render, but many crawlers (Bing/Yandex/Baidu social cards,
 * Slack/WhatsApp/Twitter/Facebook/LinkedIn unfurlers, etc.) cannot. They
 * indexed/unfurled the homepage meta on every URL.
 *
 * This middleware runs on Vercel's Edge BEFORE the vercel.json rewrites. When
 * a *known crawler* requests an *indexable SEO route*, it rewrites the request
 * to /api/prerender (a Node serverless function) which returns a complete HTML
 * document with the correct per-page title/description/canonical/JSON-LD and
 * real body content. Real users (and bots that DO run JS, like Googlebot's
 * renderer) are never affected — they get the normal SPA.
 *
 * RUNTIME
 * ───────
 * Edge runtime — Web APIs only, no Node built-ins. We deliberately do NOT
 * import `next/server` (the `next` package is not a dependency of this Vite
 * project) nor `@vercel/edge` (not installed, and the task forbids new deps).
 * Instead we emit the same internal rewrite that `NextResponse.rewrite()` /
 * `@vercel/edge`'s `rewrite()` produce under the hood: a 200 response carrying
 * the `x-middleware-rewrite` header pointing at the destination URL. Vercel
 * honours this header for Edge Middleware regardless of framework.
 */

export const config = {
  // First-line filter: skip API routes, Vercel internals, the public static
  // dir and any path that ends in a file extension (assets, *.xml, *.json,
  // *.txt, images, the SW, etc.). The middleware function below double-checks
  // the UA and the path before doing anything, so this matcher is just a cheap
  // pre-filter to keep most requests from invoking the function at all.
  matcher: [
    '/((?!api/|_next/|_vercel/|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}

// ── Crawler user-agents (matched case-insensitively as substrings) ──────────
const BOT_UA = [
  'googlebot',
  'bingbot',
  'slurp', // Yahoo
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'applebot',
  'petalbot',
  'ia_archiver',
]

function isBot(ua: string): boolean {
  const lower = ua.toLowerCase()
  return BOT_UA.some((b) => lower.includes(b))
}

// ── Indexable SEO routes ────────────────────────────────────────────────────
// Only these get prerendered. Everything else (auth, dashboard, profile,
// checkout, admin, …) is left to the SPA — those are gated/dynamic and not
// meant to be indexed.
const SEO_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/, // home
  /^\/listing\/[^/]+\/?$/, // /listing/:id
  /^\/rent\/in\/[^/]+(?:\/[^/]+)?\/?$/, // /rent/in/:city(/:rooms)
  /^\/sale\/in\/[^/]+(?:\/[^/]+)?\/?$/, // /sale/in/:city(/:rooms)
  /^\/city\/[^/]+\/?$/, // /city/:city
  /^\/blog(?:\/[^/]+)?\/?$/, // /blog(/:slug)
  /^\/guides(?:\/[^/]+)?\/?$/, // /guides(/:slug)
  /^\/pricing\/?$/,
  /^\/search\/?$/,
]

function isSeoRoute(pathname: string): boolean {
  return SEO_ROUTE_PATTERNS.some((re) => re.test(pathname))
}

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url)
  const { pathname } = url

  // Defensive: never touch API, Vercel internals, or files with extensions,
  // even though the matcher already excludes them. (A path like
  // "/listing/.foo" could slip past depending on Vercel's matcher engine.)
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_') ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return undefined // pass through untouched
  }

  const ua = request.headers.get('user-agent') || ''
  if (!isBot(ua)) {
    return undefined // real user → normal SPA
  }

  if (!isSeoRoute(pathname)) {
    return undefined // bot on a non-SEO route → normal SPA (let it 404/render)
  }

  // Bot + indexable route → rewrite to the prerender function.
  // Preserve the original pathname + search so the function can produce the
  // exact per-page output (e.g. ?page= on /search, rooms slug, etc.).
  const original = pathname + url.search
  const dest = new URL('/api/prerender', url.origin)
  dest.searchParams.set('path', original)

  // Emit the internal-rewrite header. This is the framework-agnostic
  // equivalent of NextResponse.rewrite(dest) — same wire format Vercel reads.
  return new Response(null, {
    status: 200,
    headers: {
      'x-middleware-rewrite': dest.toString(),
    },
  })
}
