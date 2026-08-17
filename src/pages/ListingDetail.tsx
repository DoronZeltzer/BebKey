import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Listing } from '../types/listing'
import { buildAddress } from '../lib/cityNames'
import { useAuth } from '../context/AuthContext'
import { useSavedListings } from '../hooks/useSavedListings'
import ListingCard from '../components/ListingCard'
import PriceHistoryChart from '../components/PriceHistoryChart'
import PriceHistorySparkline from '../components/PriceHistorySparkline'
import AiAskWidget from '../components/AiAskWidget'
import CommuteCalculator from '../components/CommuteCalculator'
import { trackEvent } from '../components/GoogleAnalytics'
import { useSeo } from '../hooks/useSeo'
import { optimizeImageUrl } from '../lib/imageUrl'

// ─── Inquiry form ─────────────────────────────────────────────────────────────
function InquiryForm({ listing }: { listing: Listing }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName]       = useState(
    (user?.user_metadata?.full_name as string | undefined) ?? ''
  )
  const [phone, setPhone]     = useState(
    (user?.user_metadata?.phone as string | undefined) ?? ''
  )
  const [email, setEmail]     = useState(user?.email ?? '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [err, setErr]         = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim() || !name.trim()) { setErr(t('inquiry.required')); return }
    setSending(true); setErr('')

    // Save inquiry to DB
    await supabase.from('inquiries').insert({
      listing_id:    listing.id,
      buyer_name:    name.trim(),
      buyer_phone:   phone.trim(),
      buyer_email:   email.trim() || null,
      message:       message.trim() || null,
      agent_user_id: listing.agent_user_id ?? null,
    })

    // Send email via Edge Function (fire-and-forget - ok if it fails)
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          type: 'inquiry',
          data: {
            agentEmail:    listing.agent_email ?? 'support@bebkey.com',
            agentName:     listing.agent_name  ?? 'Agent',
            buyerName:     name.trim(),
            buyerPhone:    phone.trim(),
            buyerEmail:    email.trim() || null,
            buyerMessage:  message.trim(),
            listingCity:   listing.city ?? '',
            listingPrice:  listing.price,
            listingId:     listing.id,
          },
        },
      })
    } catch { /* email failure is non-fatal */ }

    setSending(false); setSent(true)
  }

  if (sent) {
    return (
      <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
        <p className="text-green-700 font-semibold text-sm">✓ {t('inquiry.sent')}</p>
        <p className="text-green-600 text-xs mt-1">{t('inquiry.sentDesc')}</p>
      </div>
    )
  }

  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-center gap-2 py-2.5 border border-brand-blue/30 text-brand-blue font-medium rounded-xl hover:bg-brand-blue/5 transition text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {t('inquiry.sendInquiry')}
        </div>
      </summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3 bg-gray-50 rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('inquiry.yourName')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            required
          />
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t('inquiry.yourPhone')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            required
          />
        </div>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('inquiry.yourEmail')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t('inquiry.message')}
          rows={3}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
        />
        {err && <p className="text-red-500 text-xs">{err}</p>}
        <button
          type="submit"
          disabled={sending}
          className="py-2.5 bg-brand-blue text-white font-semibold rounded-xl text-sm hover:bg-blue-700 transition disabled:opacity-60"
        >
          {sending ? t('inquiry.sending') : t('inquiry.send')}
        </button>
      </form>
    </details>
  )
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return ''
  const map: Record<string, string> = {
    madlan:          'Madlan',
    yad2:            'Yad2',
    janglo:          'Janglo',
    onmap:           'OnMap',
    facebook:        'Facebook',
    facebook_groups: 'FB Groups',
    komo:            'Komo',
    telegram:        'Telegram',
    jpost:           'Jerusalem Post',
    manual:          'BebKey',
  }
  return map[source.toLowerCase()] ?? source
}

export default function ListingDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { isSaved, toggleSave } = useSavedListings()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgIdx, setImgIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const [similar, setSimilar] = useState<Listing[]>([])
  const [reported, setReported] = useState(false)
  const [reporting, setReporting] = useState(false)

  // ?inactive=1 set by /api/source-redirect when it detects the source URL
  // returned 404 / was permanently delisted.  Show a friendly banner.
  const showInactiveBanner = searchParams.get('inactive') === '1' ||
                              (listing != null && !listing.is_active)

  // ── SEO must be called unconditionally (Rules of Hooks) ──────────────────
  // Computed from listing when available, otherwise falls back to generic values.
  const pageTitle = listing
    ? [
        listing.price ? `₪${listing.price.toLocaleString('he-IL')}` : null,
        listing.city,
        'BebKey',
      ].filter(Boolean).join(' · ')
    : 'Property Details | BebKey'
  const seoDesc = listing
    ? [
        listing.rooms ? `${listing.rooms} rooms` : null,
        listing.size_m2 ? `${listing.size_m2} m²` : null,
        listing.city,
        listing.deal_type === 'rent' ? 'for rent' : 'for sale',
      ].filter(Boolean).join(', ')
    : ''
  useSeo({
    title: pageTitle,
    description: seoDesc,
    image: listing?.images?.[0] ?? undefined,
    url: `https://www.bebkey.com/listing/${id}`,
    type: 'article',
  })

  useEffect(() => {
    if (!id) return
    supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const l = data as Listing
          setListing(l)
          // Increment view count (fire-and-forget - non-fatal if it fails)
          supabase.rpc('increment_view_count', { listing_id: id }).then(() => {}, () => {})
          // GA4 view_item event - lets ad networks attribute "interested
          // buyer" intent to the click that brought them here
          trackEvent('view_item', {
            item_id:       String(l.id),
            item_name:     [l.property_type, l.city, l.neighborhood].filter(Boolean).join(' · '),
            item_category: l.property_type || 'apartment',
            currency:      'ILS',
            value:         l.price || 0,
            item_variant:  l.deal_type || undefined,
            city:          l.city || undefined,
          })
          // Fetch similar listings - same city + deal type, with
          // tighter matching on price (±25%) and rooms (±1) so the
          // recommendations actually feel relevant.  Falls back to the
          // looser query if the tight one comes up empty.
          const priceLo = l.price ? Math.round(l.price * 0.75) : null
          const priceHi = l.price ? Math.round(l.price * 1.25) : null
          const roomsLo = l.rooms ? l.rooms - 1 : null
          const roomsHi = l.rooms ? l.rooms + 1 : null

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase
            .from('listings')
            .select('*')
            .eq('city', l.city ?? '')
            .eq('is_active', true)
            .eq('deal_type', l.deal_type ?? 'forsale')
            .eq('has_image', true)
            .neq('id', l.id)
          if (priceLo != null) q = q.gte('price', priceLo)
          if (priceHi != null) q = q.lte('price', priceHi)
          if (roomsLo != null) q = q.gte('rooms', roomsLo)
          if (roomsHi != null) q = q.lte('rooms', roomsHi)
          q.order('quality_score', { ascending: false, nullsFirst: false })
           .order('id', { ascending: false })
           .limit(6)
           .then(({ data: sim }: { data: Listing[] | null }) => {
            if (sim && sim.length >= 3) {
              setSimilar(sim as Listing[])
              return
            }
            // Fallback: drop the price/room filters, just same-city + deal
            supabase
              .from('listings')
              .select('*')
              .eq('city', l.city ?? '')
              .eq('is_active', true)
              .eq('deal_type', l.deal_type ?? 'forsale')
              .eq('has_image', true)
              .neq('id', l.id)
              .order('quality_score', { ascending: false, nullsFirst: false })
              .order('id', { ascending: false })
              .limit(6)
              .then(({ data: fb }) => setSimilar((fb ?? []) as Listing[]))
          })
        }
        setLoading(false)
      })
  }, [id])

  // ── JSON-LD structured data ───────────────────────────────────────────────
  // ── Keyboard navigation for lightbox ────────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return
    const images = listing?.images ?? []
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      { setLightbox(false); return }
      if (e.key === 'ArrowRight')  setImgIdx(i => (i + 1) % images.length)
      if (e.key === 'ArrowLeft')   setImgIdx(i => (i - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, listing?.images])

  // ── JSON-LD structured data ───────────────────────────────────────────────
  // Maps schema.org RealEstateListing + Apartment/House so Google can render
  // rich snippets (price, photo, address) directly in search results.
  // Real-estate sites typically see 2-3x organic CTR from this.  See
  // https://developers.google.com/search/docs/appearance/structured-data
  useEffect(() => {
    if (!listing) return

    // Map our property_type → schema.org subtype
    const subType = (() => {
      switch ((listing.property_type ?? '').toLowerCase()) {
        case 'house':
        case 'villa':
        case 'cottage':
        case 'townhouse':           return 'House'
        case 'penthouse':
        case 'mini_penthouse':
        case 'apartment':
        case 'studio':
        case 'garden_apartment':
        case 'roof_apartment':
        case 'duplex':
        case 'loft':                return 'Apartment'
        default:                    return 'Apartment'
      }
    })()

    const url = `https://www.bebkey.com/listing/${listing.id}`
    const dealLabel = listing.deal_type === 'rent' ? 'for rent' : 'for sale'
    const locParts  = [listing.neighborhood, listing.city].filter(Boolean).join(', ')

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': ['RealEstateListing', subType],
      name: [
        listing.rooms ? `${listing.rooms}-room` : null,
        listing.property_type ?? subType.toLowerCase(),
        dealLabel,
        locParts ? `in ${locParts}` : null,
      ].filter(Boolean).join(' '),
      description: (
        listing.description_en ??
        listing.description ??
        `${listing.rooms ?? '?'}-room ${listing.property_type ?? 'apartment'} ${dealLabel}` +
        (locParts ? ` in ${locParts}` : '')
      ).slice(0, 5000),
      url,
      image: listing.images && listing.images.length > 0
        ? listing.images.slice(0, 10)  // up to 10 photos for the carousel
        : undefined,
      datePosted: listing.created_at ?? undefined,
      // Offer block - required for Google to show price in rich results
      offers: listing.price
        ? {
            '@type': 'Offer',
            price: listing.price,
            priceCurrency: 'ILS',
            availability: 'https://schema.org/InStock',
            url,
            ...(listing.deal_type === 'rent' ? { businessFunction: 'https://schema.org/LeaseOut' }
                                              : { businessFunction: 'https://schema.org/Sell' }),
          }
        : undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress:    listing.street ?? undefined,
        addressLocality:  listing.city ?? undefined,
        addressRegion:    listing.neighborhood ?? undefined,
        addressCountry:   'IL',
      },
      geo: listing.lat && listing.lng
        ? { '@type': 'GeoCoordinates', latitude: listing.lat, longitude: listing.lng }
        : undefined,
      floorSize: listing.size_m2
        ? { '@type': 'QuantitativeValue', value: listing.size_m2, unitCode: 'MTK', unitText: 'sqm' }
        : undefined,
      numberOfRooms: listing.rooms ?? undefined,
      // Google's docs say numberOfBedrooms helps too; in Israeli usage
      // rooms ≈ bedrooms + 1 living room, so bedrooms ≈ rooms - 1.
      numberOfBedrooms: listing.rooms ? Math.max(1, Math.round(listing.rooms - 1)) : undefined,
      // Amenity features (the boolean flags we already track)
      amenityFeature: [
        listing.parking          && { '@type': 'LocationFeatureSpecification', name: 'Parking',            value: true },
        listing.elevator         && { '@type': 'LocationFeatureSpecification', name: 'Elevator',           value: true },
        listing.balcony          && { '@type': 'LocationFeatureSpecification', name: 'Balcony',            value: true },
        listing.mamad            && { '@type': 'LocationFeatureSpecification', name: 'Safe room (mamad)',  value: true },
        listing.furnished        && { '@type': 'LocationFeatureSpecification', name: 'Furnished',          value: true },
        listing.air_conditioning && { '@type': 'LocationFeatureSpecification', name: 'Air conditioning',   value: true },
        listing.storage_room     && { '@type': 'LocationFeatureSpecification', name: 'Storage room',       value: true },
        listing.accessible       && { '@type': 'LocationFeatureSpecification', name: 'Accessible',         value: true },
      ].filter(Boolean),
      // Floor information (Israeli-specific: ground floor = קומה 0)
      ...(listing.floor !== null && listing.floor !== undefined
        ? { floorLevel: String(listing.floor) }
        : {}),
      // BebKey provenance - helps Google attribute the listing to us
      provider: {
        '@type': 'Organization',
        name: 'BebKey',
        url:  'https://www.bebkey.com',
      },
    }

    // Breadcrumb schema - helps Google render "BebKey > Tel Aviv > For rent"
    // navigation hints in the search result.
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BebKey',  item: 'https://www.bebkey.com/' },
        { '@type': 'ListItem', position: 2, name: 'Search',  item: 'https://www.bebkey.com/search' },
        listing.city ? {
          '@type': 'ListItem',
          position: 3,
          name: listing.city,
          item:  `https://www.bebkey.com/search?city=${encodeURIComponent(listing.city)}`,
        } : undefined,
        { '@type': 'ListItem', position: 4, name: schema.name as string, item: url },
      ].filter(Boolean),
    }

    function upsertScript(id: string, json: unknown) {
      let el = document.getElementById(id) as HTMLScriptElement | null
      if (!el) {
        el = document.createElement('script')
        el.id = id
        el.type = 'application/ld+json'
        document.head.appendChild(el)
      }
      el.textContent = JSON.stringify(json)
    }
    upsertScript('listing-jsonld',     schema)
    upsertScript('listing-breadcrumb', breadcrumbs)

    return () => {
      document.getElementById('listing-jsonld')?.remove()
      document.getElementById('listing-breadcrumb')?.remove()
    }
  }, [listing])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="bg-gray-200 h-72 rounded-2xl" />
        <div className="bg-gray-200 h-8 w-1/3 rounded" />
        <div className="bg-gray-200 h-5 w-1/2 rounded" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-400">
        <p className="text-lg font-medium">{t('listing.notFound')}</p>
        <Link to="/search" className="text-brand-blue underline text-sm mt-2 inline-block">
          {t('listing.backToSearch')}
        </Link>
      </div>
    )
  }

  const images = listing.images?.length ? listing.images : []
  const addressDisplay = buildAddress(listing.street, listing.neighborhood, listing.city, i18n.language)

  // Translated property type
  const propTypeKey = `listing.propertyTypes.${listing.property_type}`
  const propTypeDisplay = listing.property_type ? t(propTypeKey, listing.property_type) : null

  // Price formatter - use deal_type to decide per-month suffix, not price threshold
  const formatPrice = (price: number | null) => {
    if (!price) return '-'
    const isRent = listing.deal_type === 'rent'
    return isRent
      ? `₪${price.toLocaleString('he-IL')} ${t('listing.perMonth')}`
      : `₪${price.toLocaleString('he-IL')}`
  }

  // Auto-description using translated labels
  const autoDesc = () => {
    const parts: string[] = []
    if (listing.rooms) parts.push(`${listing.rooms} ${t('listing.rooms')}`)
    if (listing.size_m2) parts.push(`${listing.size_m2} m²`)
    if (listing.floor != null) parts.push(`${t('listing.floor')} ${listing.floor}`)
    if (addressDisplay) parts.push(addressDisplay)
    if (listing.price && listing.price >= 50000) parts.push(`₪${listing.price.toLocaleString('he-IL')}`)
    return parts.join(' · ')
  }

  // Pick the best available description for the current language
  const translatedDesc = (() => {
    const lang = i18n.language
    if (lang === 'he') return listing.description
    if (lang === 'ru') return listing.description_ru
    if (lang === 'ar') return listing.description_ar
    if (lang === 'fr') return listing.description_fr
    return listing.description_en  // en + any unknown lang
  })()

  const desc = translatedDesc || listing.description || autoDesc()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-24 md:pb-8">
      {/* Back */}
      <Link
        to="/search"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-blue mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('common.back')}
      </Link>

      {/* Inactive-listing banner - shown when /api/source-redirect detected
          a 404 on the source URL, or when the row is already is_active=false. */}
      {showInactiveBanner && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="font-semibold text-amber-900">
              {i18n.language === 'he'
                ? 'הדירה הזו כבר אינה זמינה'
                : i18n.language === 'ru'
                ? 'Эта квартира больше недоступна'
                : i18n.language === 'fr'
                ? 'Cette annonce n\'est plus disponible'
                : i18n.language === 'ar'
                ? 'هذه القائمة لم تعد متاحة'
                : 'This listing is no longer available'}
            </p>
            <p className="text-sm text-amber-800 mt-1">
              {i18n.language === 'he'
                ? 'הקישור למקור הוסר. ייתכן שהדירה הושכרה/נמכרה. '
                : i18n.language === 'ru'
                ? 'Источник удалил эту страницу - квартира, вероятно, сдана или продана. '
                : i18n.language === 'fr'
                ? 'La source a supprimé cette page - sans doute louée ou vendue. '
                : i18n.language === 'ar'
                ? 'تمت إزالة هذه القائمة من المصدر - على الأرجح تم تأجيرها أو بيعها. '
                : 'The source removed this page - the property was probably rented or sold. '}
              <Link to="/search" className="font-semibold underline hover:text-amber-900">
                {i18n.language === 'he' ? 'חפש דירות דומות'
                  : i18n.language === 'ru' ? 'Найти похожие'
                  : i18n.language === 'fr' ? 'Voir des annonces similaires'
                  : i18n.language === 'ar' ? 'ابحث عن قوائم مماثلة'
                  : 'Browse similar listings'}
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* [&>*]:min-w-0 lets the grid items shrink below their content's intrinsic
          width (grid items default to min-width:auto) so the thumbnail strip's
          overflow-x-auto actually scrolls instead of blowing out the mobile
          layout (was causing ~338px of horizontal overflow on phones). */}
      <div className="grid md:grid-cols-2 gap-8 [&>*]:min-w-0">
        {/* Left: images */}
        <div>
          <div
            className="bg-gray-100 rounded-2xl overflow-hidden h-64 md:h-80 flex items-center justify-center relative cursor-zoom-in group select-none"
            onClick={() => images[imgIdx] && setLightbox(true)}
            onTouchStart={(e) => { touchStartXRef.current = e.touches[0]?.clientX ?? null }}
            onTouchEnd={(e) => {
              const startX = touchStartXRef.current
              touchStartXRef.current = null
              if (startX == null || images.length < 2) return
              const endX = e.changedTouches[0]?.clientX ?? startX
              const dx = endX - startX
              if (Math.abs(dx) < 40) return
              // RTL swap: in Hebrew/Arabic, swiping right → next feels natural
              const rtl = i18n.dir() === 'rtl'
              if ((dx < 0 && !rtl) || (dx > 0 && rtl)) {
                setImgIdx(i => (i + 1) % images.length)
              } else {
                setImgIdx(i => (i - 1 + images.length) % images.length)
              }
            }}
          >
            {images[imgIdx] ? (
              <img
                src={optimizeImageUrl(images[imgIdx], { width: 900, quality: 85 })}
                alt=""
                referrerPolicy="no-referrer"
                draggable={false}
                className="w-full h-full object-cover"
              />
            ) : (
              <svg className="w-20 h-20 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 21V12h6v9" />
              </svg>
            )}
            {/* Prev/next arrows — visible on hover (desktop) and always on touch devices.
                Wrapped in tapping-safe stopPropagation so the underlying zoom click
                doesn't fire when the user just wants to advance the photo. */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length) }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 max-md:opacity-100 transition"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 max-md:opacity-100 transition"
                >
                  ›
                </button>
                {/* Position pill */}
                <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-full pointer-events-none">
                  {imgIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>
          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition ${
                    i === imgIdx ? 'border-brand-blue' : 'border-transparent'
                  }`}
                >
                  <img src={optimizeImageUrl(src, { width: 128, quality: 75 })} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: details */}
        <div className="flex flex-col gap-4">
          {/* Price + type */}
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="text-3xl font-bold text-brand-blue">{formatPrice(listing.price)}</p>
              {listing.previous_price && listing.price && listing.previous_price > listing.price && (
                <span className="text-sm text-rose-500 line-through">
                  ₪{listing.previous_price.toLocaleString('he-IL')}
                </span>
              )}
              {listing.previous_price && listing.price && listing.previous_price > listing.price && (
                <span className="text-xs font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full">
                  ↓ {Math.round(((listing.previous_price - listing.price) / listing.previous_price) * 100)}%
                </span>
              )}
            </div>
            {/* Inline price-history sparkline - shows trend right at the price.
                Renders nothing if there's no recorded change. */}
            <PriceHistorySparkline listingId={listing.id} currentPrice={listing.price} />
            <div className="flex flex-wrap gap-2 mt-2">
              {propTypeDisplay && (
                <span className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full">
                  {propTypeDisplay}
                </span>
              )}
              {listing.deal_type && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  listing.deal_type === 'rent'
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {listing.deal_type === 'rent' ? t('search.forRent') : t('search.forSale')}
                </span>
              )}
              {listing.condition && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {t(`search.condition${listing.condition.charAt(0).toUpperCase() + listing.condition.slice(1).replace(/_([a-z])/g, (_, l: string) => l.toUpperCase())}` as never, listing.condition)}
                </span>
              )}
              {(() => {
                const daysOnMarket = listing.created_at
                  ? Math.floor((Date.now() - new Date(listing.created_at).getTime()) / 86_400_000)
                  : null
                if (!daysOnMarket || daysOnMarket < 1) return null
                const label = daysOnMarket < 7
                  ? t('listing.listedDaysAgo',   { count: daysOnMarket })
                  : daysOnMarket < 30
                    ? t('listing.listedWeeksAgo',  { count: Math.floor(daysOnMarket / 7) })
                    : daysOnMarket < 365
                      ? t('listing.listedMonthsAgo', { count: Math.floor(daysOnMarket / 30) })
                      : t('listing.listedYearsAgo',  { count: Math.floor(daysOnMarket / 365) })
                return (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {label}
                  </span>
                )
              })()}
              {(listing.view_count ?? 0) > 0 && (
                <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {(listing.view_count ?? 0).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Address */}
          <p className="text-gray-700 font-medium">{addressDisplay}</p>

          {/* Stats grid */}
          {(() => {
            const pricePerM2 =
              listing.deal_type !== 'rent' &&
              listing.price && listing.size_m2 && listing.size_m2 > 0
                ? Math.round(listing.price / listing.size_m2)
                : null

            const stats = [
              listing.rooms != null    && { val: listing.rooms,   label: t('listing.rooms') },
              listing.size_m2 != null  && { val: `${listing.size_m2} m²`, label: t('listing.size') },
              listing.floor != null    && {
                val: listing.total_floors
                  ? `${listing.floor} / ${listing.total_floors}`
                  : String(listing.floor),
                label: t('listing.floor'),
              },
              pricePerM2 && { val: `₪${pricePerM2.toLocaleString('he-IL')}`, label: '/m²' },
            ].filter(Boolean) as { val: string | number; label: string }[]

            if (stats.length === 0) return null
            return (
              <div className={`grid gap-3 ${stats.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                {stats.map(({ val, label }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-gray-800 leading-tight">{val}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Feature badges */}
          {(() => {
            const FEATURES: { key: string; labelKey: string }[] = [
              { key: 'parking',         labelKey: 'search.parking' },
              { key: 'elevator',        labelKey: 'search.elevator' },
              { key: 'balcony',         labelKey: 'search.balcony' },
              { key: 'mamad',           labelKey: 'search.mamad' },
              { key: 'air_conditioning',labelKey: 'search.airConditioning' },
              { key: 'furnished',       labelKey: 'search.furnished' },
              { key: 'storage_room',    labelKey: 'search.storageRoom' },
              { key: 'animals_allowed', labelKey: 'search.animalsAllowed' },
              { key: 'accessible',      labelKey: 'search.accessible' },
              { key: 'tabu',            labelKey: 'search.tabu' },
              { key: 'pinui_binui',     labelKey: 'search.pinuiBinui' },
              { key: 'tama_38',         labelKey: 'search.tama38' },
            ]
            const rec = listing as unknown as Record<string, unknown>
            const active = FEATURES.filter(f => rec[f.key] === true)
            if (active.length === 0) return null
            return (
              <div className="flex flex-wrap gap-1.5">
                {active.map(f => (
                  <span key={f.key} className="inline-flex items-center gap-1 bg-blue-50 text-brand-blue text-xs font-medium px-2.5 py-1 rounded-full border border-blue-100">
                    ✓ {t(f.labelKey)}
                  </span>
                ))}
              </div>
            )
          })()}

          {/* Price history chart (hidden when no price changes recorded) */}
          <PriceHistoryChart listingId={listing.id} currentPrice={listing.price} />

          {/* AI Summary - shown when available */}
          {(() => {
            if (!listing.ai_summary) return null
            try {
              const s = JSON.parse(listing.ai_summary) as {
                summary_en?: string
                summary_he?: string
                pros?: string[]
                lifestyle_tags?: string[]
              }
              const lang = i18n.language
              const summaryText = lang === 'he' ? s.summary_he : s.summary_en
              if (!summaryText && !s.pros?.length) return null
              return (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Summary
                  </p>
                  {summaryText && (
                    <p className="text-sm text-gray-700 leading-relaxed">{summaryText}</p>
                  )}
                  {s.pros && s.pros.length > 0 && (
                    <ul className="space-y-1">
                      {s.pros.map((pro, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5">✓</span>
                          {pro}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.lifestyle_tags && s.lifestyle_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {s.lifestyle_tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-white text-brand-blue border border-brand-blue/20 px-2 py-0.5 rounded-full font-medium">
                          {tag.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            } catch { return null }
          })()}

          {/* AI Ask widget - collapsed by default.  Users can ask any
              question about this specific listing; answers are grounded
              on the listing's own data via /api/ai-ask. */}
          <AiAskWidget listingId={listing.id} />

          {/* Commute calculator - asks user for destination and shows
              driving/walking/cycling time via OSM (Nominatim + OSRM).
              Pure free OSM services, no vendor lock-in. */}
          <CommuteCalculator
            listingLat={listing.lat}
            listingLng={listing.lng}
            listingCity={listing.city}
          />

          {/* Mortgage calculator CTA - pre-fills the listing's price.
              Counter to keyz.ai's bundled mortgage adviser. */}
          {listing.price && listing.deal_type === 'forsale' && (
            <Link
              to={`/mortgage-calculator?price=${listing.price}`}
              className="w-full bg-gradient-to-r from-green-50 to-blue-50 border border-green-100 rounded-2xl p-3 flex items-center justify-between hover:from-green-100 hover:to-blue-100 transition group"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-green-800">
                <span className="text-lg">💰</span>
                {t('listing.calculateMortgage', { price: listing.price.toLocaleString('he-IL') })}
              </span>
              <span className="text-xs text-gray-500 group-hover:text-gray-700">›</span>
            </Link>
          )}

          {/* Description */}
          <p className="text-gray-600 text-sm leading-relaxed border-t pt-3">
            {desc}
          </p>

          {/* Contact / source actions */}
          <div className="flex gap-3 mt-auto">
            {listing.contact_phone ? (
              <>
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="flex-1 text-center py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-blue-700 transition text-sm"
                >
                  {t('listing.contact')}
                </a>
                <a
                  href={`https://wa.me/972${listing.contact_phone.replace(/\D/g, '').replace(/^0/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition text-sm"
                >
                  {t('listing.whatsapp')}
                </a>
              </>
            ) : (
              <a
                href={listing.source_url ? `/api/source-redirect?id=${listing.id}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-blue-700 transition text-sm"
              >
                {t('listing.viewOnSource', { source: sourceLabel(listing.source) })}
              </a>
            )}
          </div>

          {/* Share + Save buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                const url = window.location.href
                if (navigator.share) {
                  navigator.share({ title: pageTitle, url })
                } else {
                  // WhatsApp Web share as fallback (very popular in Israel)
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`${pageTitle}\n${url}`)}`,
                    '_blank', 'noopener,noreferrer'
                  )
                }
              }}
              className="flex-1 text-center py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {t('listing.share')}
            </button>

            {user && listing && (
              <button
                onClick={() => toggleSave(listing.id)}
                className={`flex-1 text-center py-2.5 border font-medium rounded-xl transition text-sm flex items-center justify-center gap-2 ${
                  isSaved(listing.id)
                    ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill={isSaved(listing.id) ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {isSaved(listing.id) ? t('listing.saved') : t('listing.save')}
              </button>
            )}
          </div>

          {/* Inquiry form */}
          <InquiryForm listing={listing} />

          {/* Source attribution */}
          {listing.source_url && (
            <a
              href={`/api/source-redirect?id=${listing.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-brand-blue text-center transition"
            >
              {t('listing.source')}: {sourceLabel(listing.source)}
            </a>
          )}

          {/* Report listing */}
          <div className="flex justify-center mt-1">
            {reported ? (
              <p className="text-xs text-green-600 font-medium">✓ {t('listing.reportThanks')}</p>
            ) : (
              <button
                disabled={reporting}
                onClick={async () => {
                  if (!listing?.id) return
                  setReporting(true)
                  await supabase.from('reported_listings').insert({
                    listing_id: listing.id,
                    reporter_user_id: user?.id ?? null,
                  })
                  setReporting(false)
                  setReported(true)
                }}
                className="text-xs text-gray-400 hover:text-red-500 transition underline decoration-dotted disabled:opacity-50"
              >
                {t('listing.report')}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Mobile sticky contact bar - only shown when there's a phone or source URL */}
      {(listing.contact_phone || listing.source_url) && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {listing.contact_phone ? (
            <>
              <a
                href={`tel:${listing.contact_phone}`}
                className="flex-1 text-center py-3 bg-brand-blue text-white font-bold rounded-xl text-sm"
              >
                {t('listing.contact')}
              </a>
              <a
                href={`https://wa.me/972${listing.contact_phone.replace(/\D/g, '').replace(/^0/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 bg-green-500 text-white font-bold rounded-xl text-sm"
              >
                {t('listing.whatsapp')}
              </a>
            </>
          ) : (
            <a
              href={listing.source_url ? `/api/source-redirect?id=${listing.id}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-3 bg-brand-blue text-white font-bold rounded-xl text-sm"
            >
              {t('listing.viewOnSource', { source: sourceLabel(listing.source) })}
            </a>
          )}
        </div>
      )}

      {/* Similar listings - tight match on price (±25%) + rooms (±1) + same
          city + deal type.  Falls back to looser match if too few results. */}
      {similar.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-800 mb-1">
            {t('listing.similarTitle') || 'Listings you might like'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('listing.similarSubtitle') || 'Same area, similar size and price'}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {similar.map(s => (
              <ListingCard
                key={s.id}
                listing={s}
                isSaved={user ? isSaved(s.id) : undefined}
                onToggleSave={user ? () => toggleSave(s.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Topic-cluster interlinks - every listing page sends crawl + click
          equity to its city landing and the most relevant guides.  This is
          how Google decides we have topic authority on Israeli real estate. */}
      {listing.city && (
        <div className="mt-12 grid sm:grid-cols-2 gap-4">
          <Link
            to={`/city/${encodeURIComponent(listing.city)}`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-2xl p-5 transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-brand-blue font-semibold mb-1">
              {t('listing.cityGuideLabel') || 'City guide'}
            </p>
            <p className="text-base font-bold text-gray-800">
              {t('listing.cityGuideTitle', { city: listing.city }) || `${listing.city} real estate guide`}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('listing.cityGuideHint') || 'Market stats, neighborhoods, and helpful guides'}
            </p>
          </Link>
          <Link
            to={listing.deal_type === 'rent'
              ? `/guides/renting-an-apartment-in-israel`
              : `/guides/buying-an-apartment-in-israel`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-2xl p-5 transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-brand-blue font-semibold mb-1">
              {t('listing.guideLabel') || 'Read first'}
            </p>
            <p className="text-base font-bold text-gray-800">
              {listing.deal_type === 'rent'
                ? (t('listing.guideRentTitle') || 'Renting in Israel - the basics')
                : (t('listing.guideBuyTitle')  || 'How to buy an apartment in Israel')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('listing.guideHint') || 'Full step-by-step guide, written for first-time buyers and renters'}
            </p>
          </Link>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && images[imgIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center select-none"
          onClick={() => setLightbox(false)}
          onTouchStart={(e) => { touchStartXRef.current = e.touches[0]?.clientX ?? null }}
          onTouchEnd={(e) => {
            const startX = touchStartXRef.current
            touchStartXRef.current = null
            if (startX == null || images.length < 2) return
            const endX = e.changedTouches[0]?.clientX ?? startX
            const dx = endX - startX
            if (Math.abs(dx) < 40) return
            e.stopPropagation()
            const rtl = i18n.dir() === 'rtl'
            if ((dx < 0 && !rtl) || (dx > 0 && rtl)) {
              setImgIdx(i => (i + 1) % images.length)
            } else {
              setImgIdx(i => (i - 1 + images.length) % images.length)
            }
          }}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl w-10 h-10 flex items-center justify-center hover:text-gray-300"
            onClick={() => setLightbox(false)}
          >
            ×
          </button>
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl w-10 h-10 flex items-center justify-center hover:text-gray-300"
                onClick={e => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length) }}
              >
                ‹
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl w-10 h-10 flex items-center justify-center hover:text-gray-300"
                onClick={e => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length) }}
              >
                ›
              </button>
            </>
          )}
          <img
            src={optimizeImageUrl(images[imgIdx], { width: 1600, quality: 90 })}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white/60 text-sm">{imgIdx + 1} / {images.length}</p>
        </div>
      )}
    </div>
  )
}
