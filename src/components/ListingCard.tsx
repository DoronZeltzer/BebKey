import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Listing } from '../types/listing'
import { buildAddress } from '../lib/cityNames'
import { optimizeImageUrl, buildSrcSet } from '../lib/imageUrl'
import { isActive } from '../lib/boosts'

interface Props {
  listing: Listing
  isSaved?: boolean
  onToggleSave?: () => void
  // Set true ONLY for the very first card above the fold so the browser
  // prioritises its image (LCP signal).  Defaults false for all others
  // so off-screen cards stay lazy + low-priority.
  eager?: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  janglo:          'Janglo',
  onmap:           'OnMap',
  madlan:          'Madlan',
  yad2:            'Yad2',
  facebook:        'Facebook',
  facebook_groups: 'FB Groups',
  komo:            'Komo',
  telegram:        'Telegram',
  jpost:           'Jerusalem Post',
  manual:          'BebKey',
}

const SOURCE_COLORS: Record<string, string> = {
  janglo:          'bg-purple-100 text-purple-700',
  onmap:           'bg-blue-100 text-blue-700',
  madlan:          'bg-teal-100 text-teal-700',
  yad2:            'bg-orange-100 text-orange-700',
  facebook:        'bg-sky-100 text-sky-700',
  facebook_groups: 'bg-indigo-100 text-indigo-700',
  komo:            'bg-amber-100 text-amber-700',
  telegram:        'bg-cyan-100 text-cyan-700',
  jpost:           'bg-red-100 text-red-700',
  manual:          'bg-brand-blue/10 text-brand-blue',
}

type FreshnessTier = 'fresh' | 'today' | 'week' | 'older'

// "JUST POSTED" / "TODAY" / "THIS WEEK" badges should reflect when the
// listing was first discovered by bebkey, not the last time we re-scraped
// it. scraped_at refreshes on every run, so using it would mark every
// rescraped listing as "fresh" even if it's actually weeks old.
function freshness(_scraped_at?: string, created_at?: string): FreshnessTier {
  if (!created_at) return 'older'
  const ageH = (Date.now() - new Date(created_at).getTime()) / 3_600_000
  if (ageH < 12)  return 'fresh'   // just posted (first day)
  if (ageH < 36) return 'today'   // today-ish
  if (ageH < 168) return 'week'   // this week
  return 'older'
}

/**
 * Human-readable "Verified X ago" string from a scraped_at timestamp.
 * This is the data-freshness badge - it tells the user when we last
 * re-confirmed the listing still exists on the source site, so they
 * know we aren't showing them a ghost listing.
 *
 * Returns null if scraped_at is missing or older than 14 days (at that
 * point the badge becomes counter-productive - we'd rather just hide it).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function verifiedRecency(t: any, scraped_at?: string): string | null {
  if (!scraped_at) return null
  const ageMin = (Date.now() - new Date(scraped_at).getTime()) / 60_000
  if (ageMin < 60) {
    const m = Math.max(1, Math.floor(ageMin))
    return `${t('listing.verifiedJustNow', 'Verified')} ${m}m ${t('listing.ago', 'ago')}`
  }
  const ageH = ageMin / 60
  if (ageH < 24) {
    return `${t('listing.verifiedJustNow', 'Verified')} ${Math.floor(ageH)}h ${t('listing.ago', 'ago')}`
  }
  const ageD = ageH / 24
  if (ageD < 14) {
    return `${t('listing.verifiedJustNow', 'Verified')} ${Math.floor(ageD)}d ${t('listing.ago', 'ago')}`
  }
  return null
}

export default function ListingCard({ listing, isSaved, onToggleSave, eager }: Props) {
  const { t, i18n } = useTranslation()

  function formatPrice(price: number | null): string {
    if (!price) return '-'
    const isRent = listing.deal_type === 'rent'
    return isRent
      ? `₪${price.toLocaleString('he-IL')} ${t('listing.perMonth')}`
      : `₪${price.toLocaleString('he-IL')}`
  }
  const LOGO_PATTERNS = ['logo', 'icon', 'brand', 'placeholder', 'avatar', 'default']
  const img = listing.images?.find(
    src => !LOGO_PATTERNS.some(p => src.toLowerCase().includes(p))
  ) ?? listing.images?.[0]
  const addressDisplay = buildAddress(listing.street, listing.neighborhood, listing.city, i18n.language)
  const tier = freshness(listing.scraped_at, listing.created_at)
  const verified = verifiedRecency(t, listing.scraped_at)
  const sourceKey = listing.source?.toLowerCase() ?? ''
  const sourceLabel = SOURCE_LABELS[sourceKey]
  const sourceColor = SOURCE_COLORS[sourceKey] ?? 'bg-gray-100 text-gray-500'

  // Price per m² - shown only for sale listings with both price and size
  const pricePerM2 =
    listing.deal_type !== 'rent' &&
    listing.price &&
    listing.size_m2 &&
    listing.size_m2 > 0
      ? Math.round(listing.price / listing.size_m2)
      : null

  // Days on market - computed from created_at, shown in details row for older listings
  const daysOnMarket = listing.created_at
    ? Math.floor((Date.now() - new Date(listing.created_at).getTime()) / 86_400_000)
    : null

  // Price drop: previous_price > price ⇒ show "↓ X%" badge
  const priceDropPct =
    listing.previous_price && listing.price && listing.previous_price > listing.price
      ? Math.round(((listing.previous_price - listing.price) / listing.previous_price) * 100)
      : null

  return (
    <Link
      to={`/listing/${listing.id}`}
      className={`group bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col ${
        listing.is_featured
          ? 'border-2 border-amber-400 ring-1 ring-amber-200'
          : 'border border-gray-100'
      }`}
    >
      {/* Image - width/height attrs (640×192 = container aspect) prevent
          layout shift (CLS, a Core Web Vital).  fetchpriority defaults
          'auto' but the FIRST visible card can opt in via the `eager`
          prop to prioritise the LCP image. */}
      <div className="relative bg-gray-100 h-48 overflow-hidden">
        {img ? (
          <img
            src={optimizeImageUrl(img, { width: 640, quality: 80 })}
            srcSet={buildSrcSet(img)}
            sizes="(max-width: 640px) 100vw, 400px"
            alt={listing.city || ''}
            referrerPolicy="no-referrer"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={eager ? 'high' : 'auto'}
            width={640}
            height={192}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M9 21V12h6v9" />
            </svg>
          </div>
        )}
        <div className="absolute top-3 start-3 flex gap-1.5 flex-wrap">
          {listing.is_featured && (
            <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
              ★ Featured
            </span>
          )}
          {isActive(listing.tag_until) && (
            <span className={`text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm ${
              listing.tag_kind === 'reduced' ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {listing.tag_kind === 'reduced' ? '↓ ' + t('boost.reduced', 'Reduced') : '🔥 ' + t('boost.hot', 'Hot')}
            </span>
          )}
          {listing.property_type && (
            <span className="bg-brand-blue text-white text-xs font-semibold px-2 py-1 rounded-full">
              {t(`listing.propertyTypes.${listing.property_type}`, listing.property_type)}
            </span>
          )}
          {listing.deal_type && (
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              listing.deal_type === 'rent'
                ? 'bg-brand-orange text-gray-900'
                : 'bg-green-500 text-white'
            }`}>
              {listing.deal_type === 'rent' ? t('search.forRent') : t('search.forSale')}
            </span>
          )}
        </div>
        {/* Photo count badge - shown when listing has multiple images */}
        {listing.images && listing.images.length > 1 && (
          <div className="absolute bottom-3 end-3 flex items-center gap-1 bg-black/50 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {listing.images.length}
          </div>
        )}
        {/* Freshness + price-drop badges */}
        <div className="absolute bottom-3 start-3 flex gap-1.5">
          {tier === 'fresh' && (
            <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shadow">
              {t('listing.justPosted') || 'Just posted'}
            </span>
          )}
          {tier === 'today' && (
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shadow">
              {t('listing.new') || 'New'}
            </span>
          )}
          {tier === 'week' && (
            <span className="bg-yellow-400 text-yellow-900 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
              {t('listing.thisWeek') || 'This week'}
            </span>
          )}
          {priceDropPct && priceDropPct >= 1 && (
            <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow inline-flex items-center gap-0.5">
              ↓ {priceDropPct}%
            </span>
          )}
          {/* Open-house badge removed for now (open-house feature paused). */}
        </div>

        {onToggleSave !== undefined && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave() }}
            aria-label={isSaved ? 'Remove from saved' : 'Save property'}
            className="absolute top-3 end-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition"
          >
            <svg
              className="w-4 h-4 transition-colors"
              fill={isSaved ? '#1A56DB' : 'none'}
              viewBox="0 0 24 24"
              stroke={isSaved ? '#1A56DB' : '#6b7280'}
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Price */}
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <p className="text-xl font-bold text-brand-blue">
            {formatPrice(listing.price)}
          </p>
          {listing.previous_price && listing.price && listing.previous_price > listing.price && (
            <span className="text-xs text-rose-500 line-through">
              ₪{listing.previous_price.toLocaleString('he-IL')}
            </span>
          )}
          {pricePerM2 && (
            <span className="text-xs text-gray-400">
              ₪{pricePerM2.toLocaleString('he-IL')}/m²
            </span>
          )}
        </div>

        {/* Location */}
        <p className="text-gray-700 font-medium text-sm mb-1">
          {addressDisplay}
        </p>

        {/* Data-freshness badge - when was this listing last verified on its
            source site?  Builds trust by showing the data is live, not stale. */}
        {verified && (
          <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mb-1">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
            </svg>
            {verified}
          </p>
        )}

        {/* Details row */}
        <div className="flex items-center gap-3 text-gray-500 text-xs mt-auto pt-3 border-t border-gray-100">
          {listing.rooms != null && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              {listing.rooms} {t('listing.rooms')}
            </span>
          )}
          {listing.size_m2 != null && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              {listing.size_m2} m²
            </span>
          )}
          {listing.floor != null && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 9l-7 7-7-7" />
              </svg>
              {t('listing.floor')} {listing.floor}
            </span>
          )}
          {/* Days on market - shown only for week/older tier listings */}
          {daysOnMarket !== null && daysOnMarket > 1 && (
            <span className="text-gray-400 text-[10px] flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {daysOnMarket < 30
                ? `${daysOnMarket}d`
                : daysOnMarket < 365
                  ? `${Math.floor(daysOnMarket / 30)}mo`
                  : `${Math.floor(daysOnMarket / 365)}y`}
            </span>
          )}
          {/* Source label - pushed to the right */}
          {sourceLabel && (
            <span className={`ms-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceColor}`}>
              {sourceLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
