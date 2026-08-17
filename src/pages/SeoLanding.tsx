/**
 * SeoLanding - programmatic landing pages for long-tail SEO.
 *
 * URL patterns (all wired in App.tsx):
 *   /rent/in/:city
 *   /sale/in/:city
 *   /rent/in/:city/:rooms-rooms
 *   /sale/in/:city/:rooms-rooms
 *
 * Each page generates a unique H1, meta title, meta description, JSON-LD,
 * and OG tags from the URL parameters - giving Google hundreds of unique
 * indexable entry points (e.g. "3-room apartments for rent in Tel Aviv"
 * vs. "2-room apartments for sale in Haifa") that wouldn't exist if all
 * search variants lived on a single /search route.
 *
 * The page renders a small intro paragraph, ~12 matching listings, and a
 * deep link to the full search (with the filters pre-applied via query
 * string).  Index of pages we expose lives in public/sitemap.xml.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import ListingCard from '../components/ListingCard'
import { translateCity } from '../lib/cityNames'
import type { Listing } from '../types/listing'

type DealType = 'rent' | 'forsale'

interface Props {
  deal: DealType
}

const PAGE_SIZE = 12

/** Convert a URL slug back to the Hebrew city name in the DB.
 *  We accept both raw Hebrew (when user navigates directly) and the
 *  English transliteration we use in sitemap links. */
function slugToCity(slug: string): string {
  // Decode URI component handles raw Hebrew in the URL.
  return decodeURIComponent(slug).replace(/-/g, ' ').trim()
}

/** Parse the `Nr-rooms` or `N-rooms` slug param. */
function parseRoomsSlug(slug: string | undefined): number | null {
  if (!slug) return null
  const m = slug.match(/^([0-9]+(?:\.5)?)-rooms?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

export default function SeoLanding({ deal }: Props) {
  const { t, i18n } = useTranslation()
  const { city: citySlug = '', rooms: roomsSlug } = useParams<{ city: string; rooms?: string }>()

  const cityName = slugToCity(citySlug)
  const cityDisplay = translateCity(cityName, i18n.language)
  const rooms = parseRoomsSlug(roomsSlug)

  const [listings, setListings] = useState<Listing[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // ── SEO meta - fully derived from URL params ───────────────────────────
  const dealWord =
    deal === 'rent' ? t('home.forRent') || 'For Rent' : t('home.forSale') || 'For Sale'

  const title = rooms
    ? `${rooms}-${t('listing.roomShort') || 'room'} ${dealWord} ${t('common.in') || 'in'} ${cityDisplay}`
    : `${dealWord} ${t('common.in') || 'in'} ${cityDisplay}`

  const description = rooms
    ? `Browse ${rooms}-room ${deal === 'rent' ? 'rentals' : 'properties for sale'} in ${cityDisplay}, Israel. Updated daily on BebKey - Israel's all-in-one real estate aggregator.`
    : `Browse every ${deal === 'rent' ? 'rental' : 'for-sale'} listing in ${cityDisplay}, Israel.  Updated daily on BebKey - Israel's all-in-one real estate aggregator.`

  const canonical = rooms
    ? `https://www.bebkey.com/${deal === 'rent' ? 'rent' : 'sale'}/in/${encodeURIComponent(cityName)}/${rooms}-rooms`
    : `https://www.bebkey.com/${deal === 'rent' ? 'rent' : 'sale'}/in/${encodeURIComponent(cityName)}`

  useSeo({ title, description, url: canonical })

  // ── Query Supabase for matching listings ───────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('listings')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .eq('city', cityName)
      .eq('deal_type', deal)
      .eq('has_image', true)
      .or('price.is.null,price.gte.200')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE)

    if (rooms != null) {
      // ±0.5 room tolerance handles 2.5 vs 3 etc.
      q = q.gte('rooms', rooms - 0.5).lte('rooms', rooms + 0.5)
    }

    q.then(({ data, count }: { data: Listing[] | null; count: number | null }) => {
      if (cancelled) return
      setListings((data ?? []) as Listing[])
      setTotal(count ?? 0)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cityName, deal, rooms])

  // Link to the full search with these filters pre-applied
  const searchQs = useMemo(() => {
    const params = new URLSearchParams({
      city:     cityName,
      dealType: deal,
    })
    if (rooms != null) params.set('rooms', String(rooms))
    return `/search?${params.toString()}`
  }, [cityName, deal, rooms])

  // BreadcrumbList JSON-LD for Google sitelinks
  useEffect(() => {
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BebKey', item: 'https://www.bebkey.com/' },
        { '@type': 'ListItem', position: 2, name: dealWord, item: `https://www.bebkey.com/search?dealType=${deal}` },
        { '@type': 'ListItem', position: 3, name: cityDisplay, item: canonical },
        ...(rooms != null
          ? [{
              '@type': 'ListItem',
              position: 4,
              name: `${rooms} ${t('listing.rooms') || 'rooms'}`,
              item: canonical,
            }]
          : []),
      ],
    }
    let el = document.getElementById('seo-landing-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'seo-landing-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(breadcrumbs)
    return () => { el?.remove() }
  }, [cityDisplay, deal, dealWord, rooms, canonical, t])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Breadcrumbs */}
      <nav className="text-xs text-gray-500 mb-3 flex flex-wrap items-center gap-1.5" aria-label="breadcrumb">
        <Link to="/" className="hover:underline">BebKey</Link>
        <span aria-hidden="true">›</span>
        <Link to={`/search?dealType=${deal}`} className="hover:underline">{dealWord}</Link>
        <span aria-hidden="true">›</span>
        <Link to={`/${deal === 'rent' ? 'rent' : 'sale'}/in/${encodeURIComponent(cityName)}`} className="hover:underline">
          {cityDisplay}
        </Link>
        {rooms != null && (
          <>
            <span aria-hidden="true">›</span>
            <span className="text-gray-700 font-medium">
              {rooms} {t('listing.rooms') || 'rooms'}
            </span>
          </>
        )}
      </nav>

      {/* Headline */}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">
        {title}
      </h1>
      <p className="text-gray-600 text-sm sm:text-base max-w-3xl mb-8 leading-relaxed">
        {description}
      </p>

      {/* Results count + deep link */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {loading
            ? '...'
            : total === 0
              ? t('seoLanding.noResults') || 'No matching listings right now.'
              : `${total?.toLocaleString('he-IL')} ${t('seoLanding.found') || 'listings found'}`}
        </p>
        {total !== null && total > listings.length && (
          <Link
            to={searchQs}
            className="text-sm text-brand-blue font-semibold hover:underline"
          >
            {t('seoLanding.viewAll') || 'View all'} →
          </Link>
        )}
      </div>

      {/* Listings */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-72 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-500 mb-4">
            {t('seoLanding.noResultsHint') || 'No active listings match these filters right now. Try a broader search or check back tomorrow - our scrapers update twice daily.'}
          </p>
          <Link
            to={`/search?dealType=${deal}`}
            className="inline-block px-5 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
          >
            {t('seoLanding.browseAll') || 'Browse all listings'}
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      {/* Footer CTA */}
      <div className="mt-10 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-2">
          {t('seoLanding.ctaTitle') || 'Looking for something more specific?'}
        </h2>
        <p className="text-gray-600 text-sm mb-4 max-w-xl mx-auto">
          {t('seoLanding.ctaBody') || 'Filter by neighborhood, size, floor, amenities, and more - or save your search to get email alerts when new matches appear.'}
        </p>
        <Link
          to={searchQs}
          className="inline-block px-6 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
        >
          {t('seoLanding.ctaButton') || 'Open advanced search'}
        </Link>
      </div>
    </div>
  )
}
