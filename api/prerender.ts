/**
 * BebKey — Bot prerendering (dynamic rendering) target.
 *
 * Vercel Node serverless function (@vercel/node). Reached ONLY via the Edge
 * middleware (middleware.ts) when a known crawler hits an indexable SEO route;
 * the middleware rewrites such requests to:
 *
 *     /api/prerender?path=<encodeURIComponent(original pathname+search)>
 *
 * It returns a COMPLETE, server-rendered HTML document (text/html, 200) with:
 *   • <html lang> + <title> + <meta name="description">
 *   • <link rel="canonical" href="https://www.bebkey.com{pathname}">  (origin +
 *     pathname only, NO query — matches src/hooks/useSeo.ts)
 *   • Open Graph + Twitter card tags
 *   • Relevant JSON-LD
 *   • A real <body> with the page's primary content + internal links
 * so crawlers index the real per-page content instead of the SPA shell.
 *
 * Data comes from Supabase REST (PostgREST) using the public anon key. No new
 * npm deps: we use global fetch (Node 18+ on Vercel).
 *
 * HARD RULE: never 500 a bot. Every path is wrapped in try/catch and any error
 * falls back to a minimal valid HTML doc with the correct canonical + a generic
 * BebKey title, still served with status 200.
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ORIGIN = 'https://www.bebkey.com'
const SITE_NAME = 'BebKey'
const DEFAULT_TITLE = 'BebKey - Israel Real Estate, All in One Place'
const DEFAULT_DESC =
  'BebKey aggregates every property listing in Israel - apartments, houses, rentals and new projects - in one searchable platform for buyers and agents.'
const DEFAULT_IMAGE = `${ORIGIN}/og-image.png`

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

// ── Small HTML helpers ──────────────────────────────────────────────────────

/** Escape for use in HTML text / double-quoted attributes. */
function esc(input: unknown): string {
  const s = input == null ? '' : String(input)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Hebrew shekel-formatted price, e.g. ₪3,200. */
function ils(price: number | null | undefined): string {
  if (price == null) return ''
  try {
    return '₪' + Number(price).toLocaleString('he-IL')
  } catch {
    return '₪' + String(price)
  }
}

interface PageMeta {
  lang: string
  title: string
  description: string
  canonicalPath: string // pathname only (no query)
  image?: string
  ogType?: 'website' | 'article'
  jsonLd?: unknown[] // each becomes its own <script type="application/ld+json">
  bodyHtml: string
}

/** Assemble the final document. Canonical is always origin + pathname. */
function renderDocument(meta: PageMeta): string {
  const canonical = ORIGIN + meta.canonicalPath
  const image = meta.image || DEFAULT_IMAGE
  const ogType = meta.ogType || 'website'
  const title = meta.title
  const desc = meta.description
  const isRtl = meta.lang === 'he' || meta.lang === 'ar'

  const ldBlocks = (meta.jsonLd || [])
    .filter(Boolean)
    .map(
      (obj) =>
        `<script type="application/ld+json">${JSON.stringify(obj).replace(
          /</g,
          '\\u003c',
        )}</script>`,
    )
    .join('\n    ')

  return `<!doctype html>
<html lang="${esc(meta.lang)}"${isRtl ? ' dir="rtl"' : ''}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta name="robots" content="index, follow" />

    <meta property="og:type" content="${esc(ogType)}" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${esc(image)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    ${ldBlocks}
  </head>
  <body>
    ${meta.bodyHtml}
  </body>
</html>`
}

/** Minimal, always-valid fallback doc. Used on ANY error so a bot never 500s. */
function renderFallback(canonicalPath: string): string {
  return renderDocument({
    lang: 'en',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    canonicalPath: canonicalPath || '/',
    bodyHtml: `<header>
      <h1>${esc(SITE_NAME)} - Israel Real Estate</h1>
      <p>${esc(DEFAULT_DESC)}</p>
      <nav>
        <a href="/">Home</a>
        <a href="/search">Search listings</a>
        <a href="/pricing">Pricing</a>
        <a href="/blog">Blog</a>
        <a href="/guides">Guides</a>
      </nav>
    </header>`,
  })
}

// ── Supabase REST ───────────────────────────────────────────────────────────

async function sbFetch<T>(pathAndQuery: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return []
  return (await res.json()) as T[]
}

/** Fetch a raw text/markdown/json file from the deployed site. */
async function fetchText(url: string): Promise<string> {
  try {
    const r = await fetch(url)
    return r.ok ? await r.text() : ''
  } catch {
    return ''
  }
}

/** Minimal, safe Markdown → HTML for article bodies (text-focused for SEO). */
function mdToHtml(md: string): string {
  const blocks: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      blocks.push('<p>' + esc(para.join(' ')) + '</p>')
      para = []
    }
  }
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    let m: RegExpMatchArray | null
    if (/^#\s+/.test(line)) { flush(); continue } // H1 == the title, rendered separately
    if ((m = line.match(/^##\s+(.+)/))) { flush(); blocks.push('<h2>' + esc(m[1]) + '</h2>'); continue }
    if ((m = line.match(/^###\s+(.+)/))) { flush(); blocks.push('<h3>' + esc(m[1]) + '</h3>'); continue }
    if (/^\|.*\|/.test(line)) {
      if (/^\|[\s:\-|]+\|?$/.test(line)) continue // table separator row
      flush(); blocks.push('<p>' + esc(line.replace(/\|/g, ' · ').replace(/^\s*·\s*/, '').trim()) + '</p>'); continue
    }
    if (/^[-*]\s+/.test(line)) { flush(); blocks.push('<p>• ' + esc(line.replace(/^[-*]\s+/, '')) + '</p>'); continue }
    para.push(line)
  }
  flush()
  // [text](url) → links (esc leaves []() intact, so this is safe post-escape)
  return blocks.join('\n      ').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

// ── Types (only the columns we select) ──────────────────────────────────────

interface ListingRow {
  id: string
  city: string | null
  price: number | null
  rooms: number | null
  size_m2: number | null
  deal_type: 'forsale' | 'rent' | null
  description: string | null
  images: string[] | null
  street: string | null
}

interface ListingCardRow {
  id: string
  city: string | null
  price: number | null
  rooms: number | null
  size_m2: number | null
  deal_type: 'forsale' | 'rent' | null
}

// ── Path parsing ────────────────────────────────────────────────────────────

interface ParsedPath {
  pathname: string // decoded, no query
  search: string // leading '?', or ''
  segments: string[] // decoded path segments
}

function parsePathParam(raw: string): ParsedPath {
  // `raw` is the original "pathname+search" (already URL-encoded once by the
  // middleware via encodeURIComponent, then decoded by Vercel into req.query).
  let value = raw || '/'
  const qIdx = value.indexOf('?')
  const pathnameRaw = qIdx === -1 ? value : value.slice(0, qIdx)
  const search = qIdx === -1 ? '' : value.slice(qIdx)

  const segments = pathnameRaw
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })

  // Normalise pathname: strip trailing slash (except root) so canonical is
  // stable. Keep it decoded for display but canonical re-encodes below.
  let pathname = '/' + segments.join('/')
  if (pathname === '/' && pathnameRaw !== '/') pathname = '/'
  return { pathname, search, segments }
}

/** Build the canonical pathname (encoded per-segment, no query). */
function canonicalFromSegments(segments: string[]): string {
  if (segments.length === 0) return '/'
  return '/' + segments.map((s) => encodeURIComponent(s)).join('/')
}

/** Parse a rooms slug like "3-rooms" / "2.5-rooms" / "3" → number | null. */
function parseRooms(slug: string | undefined): number | null {
  if (!slug) return null
  const m = slug.match(/^([0-9]+(?:\.5)?)(?:-rooms?)?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

// ── Page builders ───────────────────────────────────────────────────────────

async function buildListing(id: string, canonicalPath: string): Promise<string> {
  const rows = await sbFetch<ListingRow>(
    `listings?id=eq.${encodeURIComponent(
      id,
    )}&select=id,city,price,rooms,size_m2,deal_type,description,images,street&limit=1`,
  )
  const l = rows[0]
  if (!l) {
    // Unknown / removed listing — valid doc, generic title, correct canonical.
    return renderDocument({
      lang: 'he',
      title: `נכס | ${SITE_NAME}`,
      description: DEFAULT_DESC,
      canonicalPath,
      ogType: 'article',
      bodyHtml: `<main><h1>${esc(SITE_NAME)}</h1><p>${esc(
        DEFAULT_DESC,
      )}</p><p><a href="/search">חיפוש דירות</a></p></main>`,
    })
  }

  const dealWord = l.deal_type === 'rent' ? 'להשכרה' : 'למכירה'
  const city = l.city || 'ישראל'
  const roomsPart = l.rooms ? `${l.rooms} חדרים ` : ''
  const pricePart = l.price ? ` – ${ils(l.price)}` : ''
  const title = `${roomsPart}${dealWord} ב${city}${pricePart} | ${SITE_NAME}`

  const descBits = [
    l.rooms ? `${l.rooms} חדרים` : null,
    l.size_m2 ? `${l.size_m2} מ"ר` : null,
    l.street || city,
    l.price ? ils(l.price) : null,
  ].filter(Boolean)
  const description =
    descBits.join(' · ') ||
    `${dealWord} ב${city} - ${SITE_NAME}, נדל"ן בישראל במקום אחד.`

  const image = l.images && l.images.length > 0 ? l.images[0] : undefined

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': ['RealEstateListing', l.deal_type === 'rent' ? 'Residence' : 'Apartment'],
      name: title.replace(` | ${SITE_NAME}`, ''),
      description: l.description || description,
      url: ORIGIN + canonicalPath,
      ...(image ? { image } : {}),
      ...(l.price
        ? {
            offers: {
              '@type': 'Offer',
              price: l.price,
              priceCurrency: 'ILS',
              availability: 'https://schema.org/InStock',
              url: ORIGIN + canonicalPath,
              businessFunction:
                l.deal_type === 'rent'
                  ? 'https://schema.org/LeaseOut'
                  : 'https://schema.org/Sell',
            },
          }
        : {}),
      address: {
        '@type': 'PostalAddress',
        ...(l.street ? { streetAddress: l.street } : {}),
        ...(l.city ? { addressLocality: l.city } : {}),
        addressCountry: 'IL',
      },
      ...(l.size_m2
        ? {
            floorSize: {
              '@type': 'QuantitativeValue',
              value: l.size_m2,
              unitCode: 'MTK',
              unitText: 'sqm',
            },
          }
        : {}),
      ...(l.rooms ? { numberOfRooms: l.rooms } : {}),
      provider: { '@type': 'Organization', name: SITE_NAME, url: ORIGIN },
    },
  ]

  const detailItems = [
    l.rooms ? `<li>חדרים: ${esc(l.rooms)}</li>` : '',
    l.size_m2 ? `<li>שטח: ${esc(l.size_m2)} מ"ר</li>` : '',
    l.price ? `<li>מחיר: ${esc(ils(l.price))}</li>` : '',
    l.street ? `<li>כתובת: ${esc(l.street)}</li>` : '',
    l.city ? `<li>עיר: ${esc(l.city)}</li>` : '',
  ]
    .filter(Boolean)
    .join('\n      ')

  const bodyHtml = `<main>
    <h1>${esc(roomsPart + dealWord + ' ב' + city)}</h1>
    ${image ? `<img src="${esc(image)}" alt="${esc(title)}" width="800" />` : ''}
    <ul>
      ${detailItems}
    </ul>
    ${l.description ? `<p>${esc(l.description)}</p>` : ''}
    <p>
      <a href="/${l.deal_type === 'rent' ? 'rent' : 'sale'}/in/${encodeURIComponent(
    l.city || '',
  )}">עוד נכסים ${esc(dealWord)} ב${esc(city)}</a>
      · <a href="/search">חיפוש דירות בישראל</a>
    </p>
  </main>`

  return renderDocument({
    lang: 'he',
    title,
    description,
    canonicalPath,
    image,
    ogType: 'article',
    jsonLd,
    bodyHtml,
  })
}

async function buildDealCity(
  deal: 'rent' | 'forsale',
  citySlug: string,
  roomsSlug: string | undefined,
  canonicalPath: string,
): Promise<string> {
  const city = (citySlug || '').replace(/-/g, ' ').trim()
  const rooms = parseRooms(roomsSlug)
  const dealWord = deal === 'rent' ? 'להשכרה' : 'למכירה'

  let query =
    `listings?is_active=eq.true` +
    `&deal_type=eq.${deal}` +
    `&city=eq.${encodeURIComponent(city)}` +
    `&select=id,city,price,rooms,size_m2,deal_type` +
    `&order=created_at.desc&limit=50`
  if (rooms != null) {
    query += `&rooms=gte.${rooms - 0.5}&rooms=lte.${rooms + 0.5}`
  }
  const rows = await sbFetch<ListingCardRow>(query)

  const roomsTitle = rooms != null ? `${rooms} חדרים ` : ''
  const title = `דירות ${roomsTitle}${dealWord} ב${city} | ${SITE_NAME}`
  const description =
    rows.length > 0
      ? `${rows.length} דירות ${roomsTitle}${dealWord} ב${city}. מתעדכן יומית ב-${SITE_NAME}, אגרגטור הנדל"ן של ישראל.`
      : `דירות ${roomsTitle}${dealWord} ב${city}. מתעדכן יומית ב-${SITE_NAME}, אגרגטור הנדל"ן של ישראל.`

  const items = rows
    .map((r) => {
      const bits = [
        r.rooms ? `${r.rooms} חד'` : null,
        r.size_m2 ? `${r.size_m2} מ"ר` : null,
        r.price ? ils(r.price) : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return `<li><a href="/listing/${esc(r.id)}">${esc(
        (r.city || city) + (bits ? ' — ' + bits : ''),
      )}</a></li>`
    })
    .join('\n      ')

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title.replace(` | ${SITE_NAME}`, ''),
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${ORIGIN}/listing/${r.id}`,
      })),
    },
  ]

  const bodyHtml = `<main>
    <nav><a href="/">${esc(SITE_NAME)}</a> › <a href="/search?dealType=${deal}">${esc(
    dealWord,
  )}</a> › <span>${esc(city)}</span></nav>
    <h1>${esc('דירות ' + roomsTitle + dealWord + ' ב' + city)}</h1>
    <p>${esc(description)}</p>
    ${
      rows.length > 0
        ? `<ul>\n      ${items}\n    </ul>`
        : `<p>אין כרגע נכסים פעילים התואמים את הסינון. <a href="/search?dealType=${deal}">לכל הנכסים</a></p>`
    }
    <p><a href="/search?city=${encodeURIComponent(
      city,
    )}&dealType=${deal}">חיפוש מתקדם ב${esc(city)}</a></p>
  </main>`

  return renderDocument({
    lang: 'he',
    title,
    description,
    canonicalPath,
    jsonLd,
    bodyHtml,
  })
}

async function buildCity(citySlug: string, canonicalPath: string): Promise<string> {
  const city = (citySlug || '').replace(/-/g, ' ').trim()
  const rows = await sbFetch<ListingCardRow>(
    `listings?is_active=eq.true&city=eq.${encodeURIComponent(
      city,
    )}&select=id,city,price,rooms,size_m2,deal_type&order=created_at.desc&limit=50`,
  )

  const title = `נדל"ן ב${city} - דירות למכירה ולהשכרה | ${SITE_NAME}`
  const description = `${rows.length} דירות למכירה ולהשכרה ב${city}, ישראל. השוואת מחירים ונכסים מכל המקורות ב-${SITE_NAME}.`

  const items = rows
    .map((r) => {
      const dealWord = r.deal_type === 'rent' ? 'להשכרה' : 'למכירה'
      const bits = [
        r.rooms ? `${r.rooms} חד'` : null,
        r.size_m2 ? `${r.size_m2} מ"ר` : null,
        r.price ? ils(r.price) : null,
        dealWord,
      ]
        .filter(Boolean)
        .join(' · ')
      return `<li><a href="/listing/${esc(r.id)}">${esc(
        (r.city || city) + (bits ? ' — ' + bits : ''),
      )}</a></li>`
    })
    .join('\n      ')

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `נדל"ן ב${city}`,
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${ORIGIN}/listing/${r.id}`,
      })),
    },
  ]

  const bodyHtml = `<main>
    <nav><a href="/">${esc(SITE_NAME)}</a> › <span>${esc(city)}</span></nav>
    <h1>${esc('נדל"ן ב' + city)}</h1>
    <p>${esc(description)}</p>
    <p>
      <a href="/sale/in/${encodeURIComponent(city)}">דירות למכירה ב${esc(city)}</a>
      · <a href="/rent/in/${encodeURIComponent(city)}">דירות להשכרה ב${esc(city)}</a>
    </p>
    ${
      rows.length > 0
        ? `<ul>\n      ${items}\n    </ul>`
        : `<p>אין כרגע נכסים פעילים ב${esc(city)}. <a href="/search">חיפוש בכל הארץ</a></p>`
    }
  </main>`

  return renderDocument({
    lang: 'he',
    title,
    description,
    canonicalPath,
    jsonLd,
    bodyHtml,
  })
}

/** Static-ish pages that don't need heavy data. */
function buildStatic(
  kind: 'home' | 'search' | 'pricing' | 'blog' | 'guides',
  canonicalPath: string,
): string {
  const map: Record<typeof kind, { title: string; description: string; h1: string }> = {
    home: {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      h1: 'BebKey - כל הנדל"ן בישראל במקום אחד',
    },
    search: {
      title: `חיפוש דירות בישראל | ${SITE_NAME}`,
      description:
        'חיפוש דירות למכירה ולהשכרה בכל ערי ישראל. סינון לפי מחיר, חדרים, שטח ועוד - מכל מקורות הנדל"ן במקום אחד.',
      h1: 'חיפוש דירות בישראל',
    },
    pricing: {
      title: `מחירים ומנויים | ${SITE_NAME}`,
      description:
        'תוכניות המנוי של BebKey לסוכני נדל"ן ולמשתמשים פרטיים. גישה מלאה לכל הנכסים, התראות ופרסום מודעות.',
      h1: 'מחירים ומנויים',
    },
    blog: {
      title: `הבלוג של ${SITE_NAME} - חדשות ומדריכי נדל"ן`,
      description:
        'כתבות, ניתוחי שוק ומדריכים על שוק הנדל"ן בישראל - קנייה, השכרה, משכנתאות ועוד.',
      h1: 'הבלוג של BebKey',
    },
    guides: {
      title: `מדריכי נדל"ן | ${SITE_NAME}`,
      description:
        'מדריכים מעשיים לקונים, שוכרים ומשקיעים בנדל"ן בישראל - מאיך לקנות דירה ועד תהליך המשכנתא.',
      h1: 'מדריכי נדל"ן',
    },
  }
  const m = map[kind]

  const jsonLd =
    kind === 'home'
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: ORIGIN,
            description: DEFAULT_DESC,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${ORIGIN}/search?city={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
        ]
      : []

  const bodyHtml = `<main>
    <h1>${esc(m.h1)}</h1>
    <p>${esc(m.description)}</p>
    <nav>
      <a href="/">בית</a>
      · <a href="/search">חיפוש דירות</a>
      · <a href="/pricing">מחירים</a>
      · <a href="/blog">בלוג</a>
      · <a href="/guides">מדריכים</a>
    </nav>
  </main>`

  return renderDocument({
    lang: 'he',
    title: m.title,
    description: m.description,
    canonicalPath,
    jsonLd,
    bodyHtml,
  })
}

/** Blog post / guide page — renders the real post from public/{kind}/. */
async function buildArticle(
  kind: 'blog' | 'guides',
  slug: string,
  canonicalPath: string,
): Promise<string> {
  let meta: Record<string, string> | null = null
  try {
    const arr = JSON.parse(await fetchText(`${ORIGIN}/${kind}/index.json`))
    if (Array.isArray(arr)) meta = arr.find((p: { slug?: string }) => p.slug === slug) || null
  } catch {
    meta = null
  }
  if (!meta) return buildStatic(kind, canonicalPath) // unknown slug → generic but correct canonical

  const heading = meta.titleHe || meta.title || slug
  const title = `${heading} | ${SITE_NAME}`
  const description = meta.excerptHe || meta.excerpt || meta.title || DEFAULT_DESC

  let md = await fetchText(`${ORIGIN}/${kind}/${encodeURIComponent(slug)}.he.md`)
  if (!md) md = await fetchText(`${ORIGIN}/${kind}/${encodeURIComponent(slug)}.md`)
  const bodyContent = md ? mdToHtml(md.slice(0, 12000)) : `<p>${esc(description)}</p>`

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': kind === 'blog' ? 'BlogPosting' : 'Article',
      headline: heading,
      description: meta.excerpt || meta.excerptHe || description,
      url: ORIGIN + canonicalPath,
      ...(meta.date ? { datePublished: meta.date } : {}),
      inLanguage: 'he',
      publisher: { '@type': 'Organization', name: SITE_NAME, url: ORIGIN },
    },
  ]

  const sectionWord = kind === 'blog' ? 'בלוג' : 'מדריכים'
  const backWord = kind === 'blog' ? 'לכל הכתבות' : 'לכל המדריכים'
  const bodyHtml = `<main>
    <nav><a href="/">${esc(SITE_NAME)}</a> › <a href="/${kind}">${esc(sectionWord)}</a></nav>
    <article>
      <h1>${esc(heading)}</h1>
      ${bodyContent}
    </article>
    <p><a href="/${kind}">← ${esc(backWord)}</a></p>
  </main>`

  return renderDocument({
    lang: 'he',
    title,
    description,
    canonicalPath,
    ogType: 'article',
    jsonLd,
    bodyHtml,
  })
}

// ── Router ──────────────────────────────────────────────────────────────────

async function route(parsed: ParsedPath): Promise<string> {
  const { segments } = parsed
  const canonicalPath = canonicalFromSegments(segments)

  // /
  if (segments.length === 0) return buildStatic('home', '/')

  const [s0, s1, s2, s3] = segments

  // /listing/:id
  if (s0 === 'listing' && s1) {
    return buildListing(s1, canonicalPath)
  }

  // /rent/in/:city(/:rooms)  and  /sale/in/:city(/:rooms)
  if ((s0 === 'rent' || s0 === 'sale') && s1 === 'in' && s2) {
    const deal = s0 === 'rent' ? 'rent' : 'forsale'
    return buildDealCity(deal, s2, s3, canonicalPath)
  }

  // /city/:city
  if (s0 === 'city' && s1) {
    return buildCity(s1, canonicalPath)
  }

  // /pricing
  if (s0 === 'pricing') return buildStatic('pricing', canonicalPath)

  // /search
  if (s0 === 'search') return buildStatic('search', canonicalPath)

  // /blog(/:slug) and /guides(/:slug)
  if (s0 === 'blog') return s1 ? buildArticle('blog', s1, canonicalPath) : buildStatic('blog', canonicalPath)
  if (s0 === 'guides') return s1 ? buildArticle('guides', s1, canonicalPath) : buildStatic('guides', canonicalPath)

  // Anything else that slipped through the middleware filter → safe fallback.
  return renderFallback(canonicalPath)
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The original path (pathname+search) the bot requested.
  const rawPath =
    typeof req.query.path === 'string'
      ? req.query.path
      : Array.isArray(req.query.path)
        ? req.query.path[0]
        : '/'

  let parsed: ParsedPath
  try {
    parsed = parsePathParam(rawPath || '/')
  } catch {
    parsed = { pathname: '/', search: '', segments: [] }
  }

  let html: string
  try {
    html = await route(parsed)
  } catch {
    // NEVER 500 a bot — minimal valid doc with the correct canonical.
    let canonicalPath = '/'
    try {
      canonicalPath = canonicalFromSegments(parsed.segments)
    } catch {
      canonicalPath = '/'
    }
    html = renderFallback(canonicalPath)
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Cache prerendered HTML on the CDN; bots get fast responses, content stays
  // fresh within a few minutes (mirrors the sitemap/feed cache strategy).
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
  res.status(200).send(html)
}
