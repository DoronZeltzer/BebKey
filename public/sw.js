// BebKey Service Worker - bebkey-v2
// Strategy:
//   • API calls  → network-first  (fall back to cache)
//   • Assets     → cache-first    (fall back to network)
//   • Navigation → serve cached index.html for offline SPA routing
//
// IMPORTANT: bump CACHE_NAME every time a pre-cached asset changes
// (favicon, manifest, etc.).  The activate handler deletes any cache
// whose name != CACHE_NAME, so users on the old SW pick up the new
// asset on next visit instead of being stuck on the cached version.
const CACHE_NAME = 'bebkey-v5'

// App shell files to pre-cache on install.  Query strings match the
// versioned hrefs in index.html so the cached entry corresponds to
// the URL the page actually requests.
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg?v=5',
  '/manifest.json',
]

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  // Activate immediately - don't wait for old tabs to close
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  // Take control of all open clients without waiting for a reload
  self.clients.claim()
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests and https:// (skip chrome-extension, etc.)
  if (!['http:', 'https:'].includes(url.protocol)) return

  // ── API / Supabase → network-first ──────────────────────────────────────
  const isApi =
    url.hostname.includes('supabase') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/storage/')

  if (isApi) {
    event.respondWith(networkFirst(request))
    return
  }

  // ── Guide content (index.json + .md articles) → network-first ───────────
  // These are un-hashed, mutable files we republish whenever a guide is
  // added or translated.  Cache-first would freeze returning visitors on
  // stale metadata (e.g. English titles after we ship translations), so we
  // go network-first and fall back to the last-seen copy only when offline.
  if (url.pathname.startsWith('/guides/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // ── HTML navigation → SPA shell fallback ────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then(
          (cached) => cached ?? new Response('Offline', { status: 503 })
        )
      )
    )
    return
  }

  // ── Static assets → cache-first ─────────────────────────────────────────
  event.respondWith(cacheFirst(request))
})

// ── Strategies ───────────────────────────────────────────────────────────────

/** Network-first: try network, on failure serve from cache. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    // Only cache successful GET responses
    if (request.method === 'GET' && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/** Cache-first: serve from cache, fall back to network and update cache. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (request.method === 'GET' && response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Last resort: return empty 503
    return new Response('Offline', { status: 503 })
  }
}
