import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'
import { useSeo } from '../hooks/useSeo'
import { translateCity } from '../lib/cityNames'
import AiSearchBar from '../components/AiSearchBar'

const FEATURED_SELECT = 'id,source,price,city,street,neighborhood,size_m2,rooms,floor,property_type,deal_type,lat,lng,description,images,is_active,source_url,scraped_at,created_at,quality_score,has_image,is_featured,featured_until,spotlight_until,bump_until,tag_kind,tag_until,previous_price'

export default function Home() {
  const { t, i18n } = useTranslation()
  useSeo({
    title: 'BebKey - Israel Real Estate, All in One Place',
    description: 'Search apartments, houses, and rentals across every city, kibbutz, and moshav in Israel. Free for buyers. Powerful tools for agents.',
    url: 'https://www.bebkey.com/',
  })
  const navigate = useNavigate()
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [stats, setStats] = useState({ listings: 0, cities: 0 })
  const [featuredAll, setFeaturedAll]       = useState<Listing[]>([])
  const [featuredRent, setFeaturedRent]     = useState<Listing[]>([])
  const [featuredSale, setFeaturedSale]     = useState<Listing[]>([])
  const [featuredTab, setFeaturedTab]       = useState<'all' | 'rent' | 'forsale'>('all')
  const [spotlight, setSpotlight]           = useState<Listing[]>([])
  const [justListed, setJustListed]         = useState<Listing[]>([])

  const featured = featuredTab === 'rent' ? featuredRent : featuredTab === 'forsale' ? featuredSale : featuredAll

  useEffect(() => {
    // Total listing count.
    // Uses `count: 'estimated'` (pg_class.reltuples-based) — sub-100ms because
    // it doesn't scan the table. `count: 'exact'` was timing out at Supabase's
    // 3s REST limit on the 77K-row `listings` table with RLS enabled, returning
    // 500 + null → the homepage stat rendered as "0". Estimated is slightly
    // stale (refreshed on ANALYZE) but perfect for a homepage marketing number.
    supabase
      .from('listings')
      .select('id', { count: 'estimated', head: true })
      .eq('is_active', true)
      .then(({ count }) => {
        setStats(s => ({ ...s, listings: count ?? 0 }))
      })

    // Distinct city count via distinct select
    supabase
      .from('listings')
      .select('city')
      .eq('is_active', true)
      .not('city', 'is', null)
      .limit(10000)
      .then(({ data }) => {
        const n = new Set((data ?? []).map((r: { city: string | null }) => r.city).filter(Boolean)).size
        setStats(s => ({ ...s, cities: n }))
      })

    // Featured - all (quality-ordered, images first)
    supabase
      .from('listings')
      .select(FEATURED_SELECT)
      .eq('is_active', true)
      .eq('has_image', true)
      .or('price.is.null,price.lte.50000000')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(6)
      .then(({ data }) => setFeaturedAll((data ?? []) as Listing[]))

    // Featured - rent
    supabase
      .from('listings')
      .select(FEATURED_SELECT)
      .eq('is_active', true)
      .eq('deal_type', 'rent')
      .eq('has_image', true)
      .or('price.is.null,price.lte.50000000')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(6)
      .then(({ data }) => setFeaturedRent((data ?? []) as Listing[]))

    // Featured - forsale
    supabase
      .from('listings')
      .select(FEATURED_SELECT)
      .eq('is_active', true)
      .eq('deal_type', 'forsale')
      .eq('has_image', true)
      .or('price.is.null,price.lte.50000000')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(6)
      .then(({ data }) => setFeaturedSale((data ?? []) as Listing[]))

    // Spotlight - paid homepage-boosted listings (spotlight_until in the future)
    supabase
      .from('listings')
      .select(FEATURED_SELECT)
      .eq('is_active', true)
      .gt('spotlight_until', new Date().toISOString())
      .order('spotlight_until', { ascending: false })
      .limit(6)
      .then(({ data }) => setSpotlight((data ?? []) as Listing[]))

    // Just listed today - freshest 8 with a real city + image
    // (created_at within the last 24h, ordered newest-first)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('listings')
      .select(FEATURED_SELECT)
      .eq('is_active', true)
      .eq('has_image', true)
      .not('city', 'is', null)
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setJustListed((data ?? []) as Listing[]))
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city.trim()) params.set('city', city.trim())
    const parsedMax = parseInt(maxPrice)
    if (maxPrice && !isNaN(parsedMax) && parsedMax > 0) params.set('priceMax', String(parsedMax))
    navigate(`/search?${params.toString()}`)
  }

  return (
    <div>
      {/* ── Hero ── */}
      <section
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #0f3a9e 60%, #0a2a80 100%)' }}
        className="text-white py-24 px-4 relative overflow-hidden"
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-white" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h1 dir="ltr" className="text-5xl md:text-6xl font-extrabold mb-4 tracking-tight">
            <span className="text-white">Beb</span>
            <span className="text-brand-orange">Key</span>
          </h1>
          <p className="text-xl md:text-2xl mb-10 text-blue-100 font-light">{t('home.tagline')}</p>

          {/* AI-powered natural-language search.  Counter to keyz.ai's
              flagship feature - but our edge is the 20K+ aggregated
              listings they can't match. */}
          <AiSearchBar variant="hero" />

          {/* Classic two-field search as a fallback for users who prefer
              the simple form (or AI is offline). */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 justify-center mt-2">
            <input
              type="text"
              placeholder={t('home.searchPlaceholder')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="flex-1 px-5 py-4 rounded-xl text-gray-800 text-base focus:outline-none shadow-lg"
            />
            <input
              type="number"
              placeholder={t('home.maxPrice')}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              min={0}
              step={1}
              className="w-32 sm:w-48 px-5 py-4 rounded-xl text-gray-800 text-base focus:outline-none shadow-lg"
            />
            <button
              type="submit"
              className="px-8 py-4 bg-brand-orange hover:bg-orange-500 text-gray-900 font-bold rounded-xl transition-colors shadow-lg text-lg"
            >
              {t('home.searchBtn')}
            </button>
          </form>

          {/* Quick filters */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {[
              { label: t('home.filterTelAviv'), city: 'תל אביב יפו' },
              { label: t('home.filterJerusalem'), city: 'ירושלים' },
              { label: t('home.filterHaifa'), city: 'חיפה' },
              { label: t('home.filterRent'), dealType: 'rent' },
              { label: t('home.filterSale'), dealType: 'forsale' },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => {
                  const p = new URLSearchParams()
                  if (q.city) p.set('city', q.city)
                  if (q.dealType) p.set('dealType', q.dealType)
                  navigate(`/search?${p.toString()}`)
                }}
                className="px-4 py-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm rounded-full transition-colors border border-white/20"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="bg-white py-10 border-b shadow-sm">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center px-4">
          {[
            { label: t('home.statsListings'), value: stats.listings.toLocaleString(), color: 'text-brand-blue' },
            { label: t('home.statsCities'),   value: stats.cities.toLocaleString(),   color: 'text-brand-blue' },
            { label: t('home.statsAgents'),   value: '100+',                          color: 'text-brand-orange' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className={`text-3xl md:text-4xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Browse by City ── */}
      <section className="max-w-5xl mx-auto py-10 px-4">
        <h2 className="text-lg font-bold text-gray-700 mb-4 text-center">{t('home.browseByCity')}</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            'תל אביב יפו', 'ירושלים', 'חיפה', 'באר שבע',
            'ראשון לציון', 'פתח תקווה', 'נתניה', 'חולון',
            'בני ברק', 'רמת גן', 'אשדוד', 'הרצליה',
            'כפר סבא', 'רחובות', 'מודיעין מכבים רעות', 'אילת',
          ].map(he => (
            <Link
              key={he}
              to={`/search?city=${encodeURIComponent(he)}`}
              className="px-4 py-2 bg-white border border-gray-200 hover:border-brand-blue hover:text-brand-blue text-sm text-gray-600 rounded-full transition-colors shadow-sm"
            >
              {translateCity(he, i18n.language)}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Just listed today - freshest 8 from last 24h ─────────────────────
           Drives return visits + showcases live scraping freshness.
           Only renders when we actually have 24h data. */}
      {/* ── Spotlight (paid homepage boost) ── */}
      {spotlight.length > 0 && (
        <section className="max-w-7xl mx-auto pt-12 pb-2 px-4">
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 rounded-full px-2.5 py-1 text-xs font-bold">
              ★ {t('home.spotlightBadge')}
            </span>
            <h2 className="text-2xl font-bold text-gray-800">
              {t('home.spotlightHeading')}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {spotlight.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {justListed.length > 0 && (
        <section className="max-w-7xl mx-auto pt-12 pb-2 px-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center bg-green-100 text-green-700 rounded-full px-2.5 py-1 text-xs font-semibold">
                ● {t('home.liveBadge')}
              </span>
              <h2 className="text-2xl font-bold text-gray-800">
                {i18n.language === 'he' ? 'פורסם היום'
                  : i18n.language === 'ru' ? 'Сегодня в продаже'
                  : i18n.language === 'fr' ? 'Publié aujourd\'hui'
                  : i18n.language === 'ar' ? 'نُشر اليوم'
                  : 'Just listed today'}
              </h2>
            </div>
            <button
              onClick={() => navigate('/search?postedWithin=1')}
              className="text-sm font-medium text-brand-blue hover:underline"
            >
              {i18n.language === 'he' ? 'ראה הכל →'
                : i18n.language === 'ru' ? 'Все →'
                : i18n.language === 'fr' ? 'Voir tout →'
                : i18n.language === 'ar' ? 'عرض الكل →'
                : 'See all →'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {justListed.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {/* ── Featured Listings ── */}
      <section className="max-w-7xl mx-auto py-14 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{t('home.featuredTitle')}</h2>
          <div className="flex items-center gap-2">
            {/* Rent / Sale / All tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1 text-sm font-medium">
              {(['all', 'rent', 'forsale'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFeaturedTab(tab)}
                  className={`px-3 py-1.5 rounded-lg transition ${featuredTab === tab ? 'bg-white shadow text-brand-blue' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'all' ? t('home.tabAll') : tab === 'rent' ? t('search.forRent') : t('search.forSale')}
                </button>
              ))}
            </div>
            <Link
              to={`/search${featuredTab !== 'all' ? `?dealType=${featuredTab}` : ''}`}
              className="text-sm text-brand-blue font-medium hover:underline"
            >
              {t('home.viewAll')}
            </Link>
          </div>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="bg-gray-200 h-48" />
                <div className="p-4 space-y-3">
                  <div className="bg-gray-200 h-5 w-1/2 rounded" />
                  <div className="bg-gray-200 h-4 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CTA Section ── */}
      <section className="bg-gray-50 border-t py-16 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          {/* Buyer CTA */}
          <div
            onClick={() => navigate('/search')}
            className="bg-brand-blue text-white rounded-2xl p-8 flex flex-col gap-3 cursor-pointer hover:shadow-xl transition-shadow group"
          >
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">{t('home.ctaBuyer')}</h2>
            <p className="text-blue-200 text-sm">
              {t('home.ctaBuyerDesc', { count: stats.listings.toLocaleString() })}
            </p>
            <span className="text-sm font-semibold group-hover:underline mt-auto">{t('home.searchNow')}</span>
          </div>

          {/* Agent CTA */}
          <div
            onClick={() => navigate('/register')}
            className="bg-brand-orange text-gray-900 rounded-2xl p-8 flex flex-col gap-3 cursor-pointer hover:shadow-xl transition-shadow group"
          >
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">{t('home.ctaAgent')}</h2>
            <p className="text-orange-100 text-sm">
              {t('home.ctaAgentDesc')}
            </p>
            <span className="text-sm font-semibold group-hover:underline mt-auto">{t('home.joinFree')}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
