/**
 * BebKey - image URL helper.
 *
 * Listings hot-link images from each source's CDN (Yad2 / Madlan / Komo /
 * Facebook).  Some of those CDNs are slow or geo-restricted.
 *
 * We route every external image through wsrv.nl (https://wsrv.nl), a free
 * caching proxy that:
 *   - Caches and serves from a global CDN (HTTP/2, fast everywhere)
 *   - Converts to WebP/AVIF automatically (≈30-60% smaller payloads)
 *   - Lets us resize on demand without storing anything
 *
 * Skipped for:
 *   - Already-proxied URLs (idempotent)
 *   - data: URIs (placeholders, blurhash, etc.)
 *   - Empty / null
 *   - Supabase-hosted images (already on a fast CDN, no benefit)
 */

const PROXY_BASE = 'https://wsrv.nl/'

const SKIP_HOSTS = ['supabase.co', 'wsrv.nl', 'bebkey.com']

export function optimizeImageUrl(
  src: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number } = {},
): string {
  if (!src) return ''
  if (src.startsWith('data:') || src.startsWith('blob:')) return src
  if (SKIP_HOSTS.some(h => src.includes(h))) return src

  // Strip protocol so the proxy can normalise.
  const stripped = src.replace(/^https?:\/\//, '')

  const params = new URLSearchParams({ url: stripped, output: 'webp' })
  if (opts.width)  params.set('w', String(opts.width))
  if (opts.height) params.set('h', String(opts.height))
  if (opts.width && opts.height) params.set('fit', 'cover')
  if (opts.quality) params.set('q', String(opts.quality))

  return `${PROXY_BASE}?${params.toString()}`
}

/**
 * Build a `srcset` for responsive images.  Use with `<img sizes="...">`
 * so browsers pick the right resolution.
 */
export function buildSrcSet(
  src: string | null | undefined,
  widths: number[] = [320, 640, 960],
): string {
  if (!src) return ''
  return widths
    .map(w => `${optimizeImageUrl(src, { width: w, quality: 80 })} ${w}w`)
    .join(', ')
}
