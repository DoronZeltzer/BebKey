/**
 * /neighborhoods/:city
 *
 * Drill-down into all neighborhoods within a single city.  Cards show:
 *   - Neighborhood name
 *   - Active listing count
 *   - Median rent + sale price
 *   - Sample image (most recent listing's photo)
 *   - Deep-link to /search?city=X&neighborhood=Y
 *
 * Linked from:
 *   - CityCompare (under the "Neighborhoods" stat row)
 *   - CityLanding (existing /city/:cityName page)
 *
 * New programmatic SEO surface: every (city × non-empty list of
 * neighborhoods) becomes a separate indexable page that ranks for
 * "best neighborhoods in <city>" queries.
 */
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import { translateCity } from '../lib/cityNames'
import { optimizeImageUrl, buildSrcSet } from '../lib/imageUrl'

interface NeighborhoodRow {
  name:       string
  total:      number
  rentMedian: number | null
  saleMedian: number | null
  sampleImg:  string | null
}

interface RawListing {
  neighborhood: string | null
  price:        number | null
  deal_type:    string | null
  images:       string[] | null
}

function median(arr: number[]): number | null {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function fmtPrice(n: number | null): string {
  if (n == null) return '-'
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000)      return `₪${(n / 1000).toFixed(1)}K`
  return `₪${n}`
}

export default function NeighborhoodsCity() {
  const { city: cityParam = '' } = useParams()
  // Replace '+' with space BEFORE decodeURIComponent: URL spaces are
  // encoded as either '+' (form-style) or %20.  decodeURIComponent
  // only handles %20.
  const city = decodeURIComponent(cityParam.replace(/\+/g, ' '))
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  const [rows, setRows] = useState<NeighborhoodRow[]>([])
  const [loading, setLoading] = useState(true)

  const localizedCity = translateCity(city, i18n.language)

  useSeo({
    title: `Neighborhoods in ${localizedCity} - Median prices + ${rows.length} areas | BebKey`,
    description: `Browse ${rows.length} neighborhoods in ${localizedCity}, Israel - median rent and sale prices for each area. Powered by 20,000+ live listings.`,
    url: `https://www.bebkey.com/neighborhoods/${encodeURIComponent(city)}`,
  })

  useEffect(() => {
    setLoading(true)
    supabase
      .from('listings')
      .select('neighborhood,price,deal_type,images')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .not('neighborhood', 'is', null)
      .limit(1000)
      .then(({ data, error }) => {
        if (error || !data) { setRows([]); setLoading(false); return }

        // Group by neighborhood
        const groups: Record<string, RawListing[]> = {}
        for (const l of data as RawListing[]) {
          const n = (l.neighborhood ?? '').trim()
          if (!n) continue
          if (!groups[n]) groups[n] = []
          groups[n].push(l)
        }

        const out: NeighborhoodRow[] = Object.entries(groups).map(([name, items]) => {
          const rents = items.filter(i => i.deal_type === 'rent'    && i.price).map(i => i.price as number)
          const sales = items.filter(i => i.deal_type === 'forsale' && i.price).map(i => i.price as number)
          const sampleImg = items.find(i => i.images && i.images.length > 0)?.images?.[0] ?? null
          return {
            name,
            total:      items.length,
            rentMedian: median(rents),
            saleMedian: median(sales),
            sampleImg,
          }
        })
        // Sort by total listings desc - biggest neighborhoods first
        out.sort((a, b) => b.total - a.total)
        setRows(out)
        setLoading(false)
      })
  }, [city])

  const label = (key: string) => ({
    title: { he: `שכונות ב${localizedCity}`, en: `Neighborhoods in ${localizedCity}`, ru: `Районы в ${localizedCity}`, fr: `Quartiers à ${localizedCity}`, ar: `أحياء في ${localizedCity}` },
    sub: { he: `${rows.length} שכונות עם דירות פעילות`, en: `${rows.length} neighborhoods with active listings`, ru: `${rows.length} районов с активными объявлениями`, fr: `${rows.length} quartiers avec des annonces actives`, ar: `${rows.length} حيًا مع قوائم نشطة` },
    listings: { he: 'דירות', en: 'listings', ru: 'объявлений', fr: 'annonces', ar: 'قوائم' },
    rent: { he: 'שכירות חציונית', en: 'Median rent', ru: 'Медианная аренда', fr: 'Loyer médian', ar: 'متوسط الإيجار' },
    sale: { he: 'מכירה חציונית', en: 'Median sale', ru: 'Медианная цена', fr: 'Prix médian', ar: 'متوسط البيع' },
    backToCity: { he: 'חזרה ל-' + localizedCity, en: `Back to ${localizedCity}`, ru: `Назад в ${localizedCity}`, fr: `Retour à ${localizedCity}`, ar: `العودة إلى ${localizedCity}` },
    seeAll: { he: 'הצג דירות', en: 'See listings', ru: 'Объявления', fr: 'Voir annonces', ar: 'عرض القوائم' },
    none: { he: 'לא נמצאו שכונות לעיר זו.', en: 'No neighborhoods found for this city.', ru: 'Районы не найдены.', fr: 'Aucun quartier trouvé.', ar: 'لم يتم العثور على أحياء.' },
  }[key as 'title']?.[i18n.language] ?? '')

  // Generate JSON-LD ItemList for SEO - Google treats this as a curated list
  useEffect(() => {
    if (rows.length === 0) return
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: rows.slice(0, 50).map((r, idx) => ({
        '@type':    'ListItem',
        position:   idx + 1,
        url:        `https://www.bebkey.com/search?city=${encodeURIComponent(city)}&neighborhood=${encodeURIComponent(r.name)}`,
        name:       `${r.name}, ${localizedCity} - ${r.total} listings`,
      })),
    }
    const id = 'neighborhood-jsonld'
    let el = document.getElementById(id) as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = id
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(ld)
    return () => { document.getElementById(id)?.remove() }
  }, [rows, city, localizedCity])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-2 flex flex-wrap items-center gap-1">
        <Link to="/" className="hover:text-brand-blue">BebKey</Link>
        <span>›</span>
        <Link to={`/city/${encodeURIComponent(city)}`} className="hover:text-brand-blue">{localizedCity}</Link>
        <span>›</span>
        <span className="text-gray-700">{label('title')}</span>
      </nav>

      <h1 className="text-3xl md:text-4xl font-extrabold mb-2 text-gray-900">
        {label('title')}
      </h1>
      <p className="text-gray-600 mb-6">{label('sub')}</p>

      {loading && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-500">
          {label('none')}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {rows.map((r) => (
            <button
              key={r.name}
              onClick={() => navigate(`/search?city=${encodeURIComponent(city)}&neighborhood=${encodeURIComponent(r.name)}`)}
              className="text-start bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-brand-blue transition group"
            >
              {/* Sample image - width/height attrs prevent CLS */}
              <div className="relative bg-gray-100 h-32 overflow-hidden">
                {r.sampleImg ? (
                  <img
                    src={optimizeImageUrl(r.sampleImg, { width: 640, quality: 75 })}
                    srcSet={buildSrcSet(r.sampleImg)}
                    sizes="(max-width: 640px) 100vw, 320px"
                    alt={r.name}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={128}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                    </svg>
                  </div>
                )}
                <span className="absolute top-2 end-2 bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-semibold px-2 py-1 rounded-full">
                  {r.total} {label('listings')}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-brand-blue transition-colors">
                  {r.name}
                </h3>
                {r.rentMedian && (
                  <p className="text-xs text-gray-600 flex justify-between">
                    <span>{label('rent')}</span>
                    <span className="font-semibold text-gray-900">{fmtPrice(r.rentMedian)}/mo</span>
                  </p>
                )}
                {r.saleMedian && (
                  <p className="text-xs text-gray-600 flex justify-between mt-1">
                    <span>{label('sale')}</span>
                    <span className="font-semibold text-gray-900">{fmtPrice(r.saleMedian)}</span>
                  </p>
                )}
                <p className="text-xs text-brand-blue mt-3 font-medium">
                  {label('seeAll')} →
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <Link
          to={`/city/${encodeURIComponent(city)}`}
          className="text-sm font-medium text-gray-600 hover:text-brand-blue underline"
        >
          ← {label('backToCity')}
        </Link>
      </div>
    </div>
  )
}
