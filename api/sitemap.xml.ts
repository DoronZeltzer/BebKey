/**
 * BebKey - Dynamic Sitemap Generator
 * Served at /api/sitemap.xml via Vercel Edge Runtime.
 * Queries all active listing IDs from Supabase and returns a complete XML sitemap.
 * Cached for 1 hour on Vercel's CDN so Google gets fast responses.
 */

export const config = { runtime: 'edge' }

const BASE_URL = 'https://www.bebkey.com'

const STATIC_URLS = [
  { path: '/',              priority: '1.0', changefreq: 'daily'   },
  { path: '/search',        priority: '0.9', changefreq: 'daily'   },
  { path: '/pricing',       priority: '0.8', changefreq: 'monthly' },
  { path: '/register',      priority: '0.7', changefreq: 'monthly' },
  { path: '/login',         priority: '0.6', changefreq: 'monthly' },
  { path: '/terms',         priority: '0.3', changefreq: 'yearly'  },
  { path: '/privacy',       priority: '0.3', changefreq: 'yearly'  },
  { path: '/refund',        priority: '0.2', changefreq: 'yearly'  },
  { path: '/accessibility', priority: '0.2', changefreq: 'yearly'  },
]

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

export default async function handler(): Promise<Response> {
  const supabaseUrl  = process.env.VITE_SUPABASE_URL
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return new Response('Missing env vars', { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  // ── Fetch all active listing IDs + scraped_at ─────────────────────────────
  let listings: { id: string; scraped_at: string | null }[] = []
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/listings?select=id,scraped_at&is_active=eq.true&order=scraped_at.desc&limit=50000`,
      {
        headers: {
          apikey:        supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )
    if (res.ok) {
      listings = await res.json()
    }
  } catch {
    // If Supabase is unreachable, serve static URLs only
  }

  // ── Build XML ─────────────────────────────────────────────────────────────
  const staticEntries = STATIC_URLS.map(({ path, priority, changefreq }) =>
    urlEntry(`${BASE_URL}${path}`, today, changefreq, priority)
  )

  const listingEntries = listings.map(({ id, scraped_at }) =>
    urlEntry(
      `${BASE_URL}/listing/${id}`,
      scraped_at ? scraped_at.split('T')[0] : today,
      'weekly',
      '0.7'
    )
  )

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${[...staticEntries, ...listingEntries].join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type':  'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag':  'noindex',  // don't index the sitemap itself
    },
  })
}
