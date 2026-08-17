import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'

// ─── helpers ───────────────────────────────────────────────────────────────

// Static "about" blurbs for top cities; all others get a generic template.
const CITY_BLURBS: Record<string, string> = {
  'תל אביב': `Tel Aviv-Yafo is Israel's cultural and economic powerhouse, home to a vibrant tech scene, world-class restaurants, and a stunning Mediterranean beachfront. The city draws buyers and renters seeking an urban lifestyle with walkable neighborhoods like Florentin, the White City, and the Port district. Demand consistently outpaces supply, making Tel Aviv one of the most competitive real estate markets in the Middle East.`,
  'תל אביב-יפו': `Tel Aviv-Yafo is Israel's cultural and economic powerhouse, home to a vibrant tech scene, world-class restaurants, and a stunning Mediterranean beachfront. The city draws buyers and renters seeking an urban lifestyle with walkable neighborhoods like Florentin, the White City, and the Port district. Demand consistently outpaces supply, making Tel Aviv one of the most competitive real estate markets in the Middle East.`,
  'ירושלים': `Jerusalem is Israel's eternal capital and a city unlike any other - where ancient history and modern life intersect every day. The real estate market spans everything from renovated stone apartments in the German Colony and Rehavia to newly built towers in Givat Shaul. The city appeals to families, students, and investors drawn by its spiritual significance, major universities, and government presence.`,
  'חיפה': `Haifa is Israel's northern gateway - a port city built on the slopes of Mount Carmel overlooking a stunning bay. Known for its pioneering coexistence and the UNESCO-listed Bahá'í Gardens, Haifa offers more affordable prices than Tel Aviv while delivering excellent quality of life. The Technion and University of Haifa anchor a growing tech and biotech sector, fueling sustained housing demand.`,
}

function getCityBlurb(cityName: string): string {
  return (
    CITY_BLURBS[cityName] ??
    `${cityName} is a vibrant city in Israel with a rich community life, convenient public transport links, and a diverse range of housing options. Whether you are looking for a modern apartment, a spacious family home, or an investment property, ${cityName} offers opportunities across every budget and lifestyle. Explore the listings below to find your perfect home.`
  )
}

// ─── skeleton ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5 flex flex-col items-center text-center gap-1">
      <p className="text-2xl font-bold text-brand-blue">{value}</p>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────

function CityJsonLd({
  cityName,
  listingCount,
  listings,
}: {
  cityName: string
  listingCount: number
  listings: Listing[]
}) {
  const citySchema = {
    '@context': 'https://schema.org',
    '@type': 'City',
    name: cityName,
    addressCountry: 'IL',
  }

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Properties in ${cityName}`,
    numberOfItems: listingCount,
    itemListElement: listings.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.bebkey.com/listing/${l.id}`,
      name: l.title ?? `${l.property_type ?? 'Property'} in ${cityName}`,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(citySchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
    </>
  )
}

// ─── main component ────────────────────────────────────────────────────────

interface NeighborhoodStat {
  deal_type: 'forsale' | 'rent'
  avg_price_per_m2: number | null
  avg_price: number | null
}

export default function CityLanding() {
  const { cityName = '' } = useParams<{ cityName: string }>()
  const { t, i18n } = useTranslation()

  // Data state
  const [loading, setLoading] = useState(true)
  const [listingCount, setListingCount] = useState<number>(0)
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<{
    salePerM2: number | null
    rentPerM2: number | null
  }>({ salePerM2: null, rentPerM2: null })
  const [notFound, setNotFound] = useState(false)

  // SEO - update once count is known
  useSeo({
    title: t('cityPage.seoTitle', { cityName }) || `Properties in ${cityName} | BebKey`,
    description:
      t('cityPage.seoDescription', { count: listingCount, cityName }) ||
      `Find ${listingCount} apartments and houses for sale and rent in ${cityName}, Israel.`,
  })

  useEffect(() => {
    if (!cityName) return
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setNotFound(false)

      // 1. Count active listings in the city
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('city', cityName)
        .eq('is_active', true)

      if (cancelled) return
      const total = count ?? 0
      setListingCount(total)

      if (total === 0) {
        setNotFound(true)
        setLoading(false)
        return
      }

      // 2. Featured listings: has_image, ordered by quality_score desc
      const { data: featuredData } = await supabase
        .from('listings')
        .select('*')
        .eq('city', cityName)
        .eq('is_active', true)
        .eq('has_image', true)
        .order('quality_score', { ascending: false })
        .limit(8)

      // 3. City stats from neighborhood_stats materialized view
      const { data: statsData } = await supabase
        .from('neighborhood_stats')
        .select('deal_type, avg_price_per_m2, avg_price')
        .eq('city', cityName)

      if (cancelled) return

      if (featuredData) setListings(featuredData as Listing[])

      if (statsData) {
        const saleRow = (statsData as NeighborhoodStat[]).find(r => r.deal_type === 'forsale')
        const rentRow = (statsData as NeighborhoodStat[]).find(r => r.deal_type === 'rent')
        setStats({
          salePerM2: saleRow?.avg_price_per_m2 ?? null,
          rentPerM2: rentRow?.avg_price_per_m2 ?? null,
        })
      }

      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [cityName])

  // ── 404 state ──────────────────────────────────────────────────────────
  if (!loading && notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="text-6xl mb-4">🏙️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t('cityPage.notFoundTitle', { cityName }) || `No listings found in ${cityName}`}
        </h1>
        <p className="text-gray-500 mb-8 max-w-md">
          {t('cityPage.notFoundDesc') ||
            "We couldn't find any active listings in this city. Try searching another city or check back soon."}
        </p>
        <Link
          to="/search"
          className="bg-brand-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
        >
          {t('listing.backToSearch') || 'Back to search'}
        </Link>
      </div>
    )
  }

  // ── layout ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* JSON-LD (only once data loaded) */}
      {!loading && (
        <CityJsonLd cityName={cityName} listingCount={listingCount} listings={listings} />
      )}

      {/* ── Hero ── */}
      <section className="bg-brand-blue text-white py-16 px-4">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            {t('cityPage.heroTitle', { cityName }) || `${cityName} Real Estate`}
          </h1>
          <p className="text-blue-100 text-lg sm:text-xl max-w-2xl mx-auto">
            {loading
              ? t('common.loading') || 'Loading...'
              : t('cityPage.heroSubtitle', { count: listingCount, cityName }) ||
                `${listingCount.toLocaleString()} properties for sale and rent in ${cityName}, Israel`}
          </p>
        </div>
      </section>

      {/* ── Quick Stats ── */}
      <section className="max-w-5xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 h-24 animate-pulse" />
              ))}
            </>
          ) : (
            <>
              <StatCard
                label={t('cityPage.statListings') || 'Active listings'}
                value={listingCount.toLocaleString()}
              />
              <StatCard
                label={t('cityPage.statSalePerM2') || 'Avg sale price / m²'}
                value={stats.salePerM2 ? `₪${stats.salePerM2.toLocaleString()}` : '-'}
              />
              <StatCard
                label={t('cityPage.statRentPerM2') || 'Avg rent price / m²'}
                value={stats.rentPerM2 ? `₪${stats.rentPerM2.toLocaleString()}` : '-'}
              />
            </>
          )}
        </div>
      </section>

      {/* ── Featured listings grid ── */}
      <section className="max-w-5xl mx-auto px-4 py-12 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">
          {t('cityPage.featuredTitle', { cityName }) || `Featured listings in ${cityName}`}
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {listings.map(l => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">
            {t('cityPage.noFeatured') || 'No featured listings available yet.'}
          </p>
        )}

        {/* CTA */}
        <div className="flex justify-center pt-4">
          <Link
            to={`/search?city=${encodeURIComponent(cityName)}`}
            className="inline-flex items-center gap-2 bg-brand-blue text-white px-8 py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition shadow-sm"
          >
            {t('cityPage.viewAll', { cityName }) || `View all listings in ${cityName}`}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── About the city ── */}
      <section className="max-w-5xl mx-auto px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t('cityPage.aboutTitle', { cityName }) || `About living in ${cityName}`}
          </h2>
          <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
            {getCityBlurb(cityName)}
          </p>
          <Link
            to={`/search?city=${encodeURIComponent(cityName)}`}
            className="inline-block text-brand-blue text-sm font-semibold hover:underline"
          >
            {t('cityPage.browseAll', { cityName }) || `Browse all ${cityName} properties →`}
          </Link>
        </div>
      </section>

      {/* ── Quick filters - deep links to programmatic SEO landing pages.
            Each one is an indexable URL with its own H1, meta, and JSON-LD.  */}
      <section className="max-w-5xl mx-auto px-4 pb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t('cityPage.exploreTitle', { cityName }) || `Explore ${cityName} by category`}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to={`/rent/in/${encodeURIComponent(cityName)}`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-xl p-4 text-center transition-colors"
          >
            <p className="text-2xl mb-1">🏠</p>
            <p className="text-sm font-semibold text-gray-800">
              {t('home.forRent') || 'For Rent'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{cityName}</p>
          </Link>
          <Link
            to={`/sale/in/${encodeURIComponent(cityName)}`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-xl p-4 text-center transition-colors"
          >
            <p className="text-2xl mb-1">🔑</p>
            <p className="text-sm font-semibold text-gray-800">
              {t('home.forSale') || 'For Sale'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{cityName}</p>
          </Link>
          <Link
            to={`/rent/in/${encodeURIComponent(cityName)}/3-rooms`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-xl p-4 text-center transition-colors"
          >
            <p className="text-2xl mb-1">🛋️</p>
            <p className="text-sm font-semibold text-gray-800">
              3 {t('listing.rooms') || 'rooms'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('home.forRent') || 'Rent'} · {cityName}</p>
          </Link>
          <Link
            to={`/sale/in/${encodeURIComponent(cityName)}/4-rooms`}
            className="bg-white border border-gray-100 hover:border-brand-blue rounded-xl p-4 text-center transition-colors"
          >
            <p className="text-2xl mb-1">🏘️</p>
            <p className="text-sm font-semibold text-gray-800">
              4 {t('listing.rooms') || 'rooms'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('home.forSale') || 'Sale'} · {cityName}</p>
          </Link>
        </div>
      </section>

      {/* ── Helpful guides - topic-cluster interlinking for SEO.  Every city
            page links to the same 4 high-traffic guides.  Google rewards
            this internal-linking pattern as a "topic authority" signal. */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t('cityPage.guidesTitle') || 'Helpful guides before you buy or rent'}
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              slug: 'buying-an-apartment-in-israel',
              he: 'איך קונים דירה בישראל',
              en: 'How to buy an apartment in Israel',
              ru: 'Как купить квартиру в Израиле',
              ar: 'كيفية شراء شقة في إسرائيل',
              fr: 'Comment acheter un appartement en Israël',
            },
            {
              slug: 'israeli-mortgage-mashkanta-guide',
              he: 'מדריך משכנתא בישראל',
              en: 'Israeli mortgage explained',
              ru: 'Гид по израильской ипотеке',
              ar: 'شرح الرهن العقاري الإسرائيلي',
              fr: 'Le prêt immobilier israélien expliqué',
            },
            {
              slug: 'mas-rechisha-purchase-tax',
              he: 'מס רכישה',
              en: 'Mas Rechisha — Israeli purchase tax',
              ru: 'Mas Rechisha — израильский налог на покупку',
              ar: 'Mas Rechisha — ضريبة الشراء الإسرائيلية',
              fr: 'Mas Rechisha — taxe d\'achat israélienne',
            },
            {
              slug: 'arnona-property-tax',
              he: 'ארנונה — מס עירוני',
              en: 'Arnona — municipal property tax',
              ru: 'Arnona — муниципальный налог',
              ar: 'Arnona — الضريبة البلدية',
              fr: 'Arnona — taxe foncière municipale',
            },
          ].map(g => {
            const lang = i18n.language as 'he' | 'en' | 'ru' | 'ar' | 'fr'
            const label = g[lang] ?? g.en
            return (
              <Link
                key={g.slug}
                to={`/guides/${g.slug}`}
                className="bg-white border border-gray-100 hover:border-brand-blue rounded-xl p-4 flex items-center justify-between transition-colors"
              >
                <span className="text-sm font-semibold text-gray-800">{label}</span>
                <span className="text-brand-blue text-sm">→</span>
              </Link>
            )
          })}
        </div>
        <Link
          to="/guides"
          className="inline-block mt-4 text-sm text-brand-blue font-medium hover:underline"
        >
          {t('cityPage.allGuides') || 'See all guides'} →
        </Link>
      </section>
    </div>
  )
}
