/**
 * /compare?a=<cityA>&b=<cityB>
 *
 * Side-by-side comparison of any two Israeli cities - total listings,
 * median rent/sale prices, average rooms/sqm, freshness, source mix.
 * Drives a new programmatic SEO surface ("Tel Aviv vs Jerusalem real
 * estate prices") and helps olim decide where to live.
 *
 * Anchor cities for the empty-state are BebKey's top-traffic cities.
 */
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import { translateCity } from '../lib/cityNames'

interface CityStats {
  city:              string
  total:             number
  rentCount:         number
  saleCount:         number
  medianRent:        number | null
  medianSale:        number | null
  p25Rent:           number | null
  p75Rent:           number | null
  p25Sale:           number | null
  p75Sale:           number | null
  avgRooms:          number | null
  avgSize:           number | null
  neighborhoodCount: number
  newWithin7d:       number
}

const ANCHOR_CITIES = [
  'תל אביב יפו', 'ירושלים', 'חיפה', 'באר שבע', 'ראשון לציון',
  'פתח תקווה', 'נתניה', 'חולון', 'רמת גן', 'הרצליה',
  'אשדוד', 'נס ציונה', 'מודיעין', 'רחובות', 'רעננה',
  'בית שמש', 'אילת', 'כפר סבא', 'אריאל', 'אפרת',
]

function fmt(n: number | null): string {
  if (n == null) return '-'
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000)      return `₪${(n / 1000).toFixed(1)}K`
  return `₪${n}`
}

function pct(a: number | null, b: number | null): string | null {
  if (a == null || b == null || b === 0) return null
  const d = ((a - b) / b) * 100
  if (Math.abs(d) < 1) return '≈ same'
  return d > 0 ? `+${d.toFixed(0)}%` : `${d.toFixed(0)}%`
}

async function fetchStats(city: string): Promise<CityStats> {
  // Two queries in parallel:
  //  - exact total count (HEAD via { count: 'exact', head: true })
  //  - a 1000-row sample for client-side medians/averages
  // Supabase default row cap is 1000 so the sample is naturally
  // limited; for median estimation 1000 random rows is more than
  // enough for stable percentiles.
  const [totalRes, sampleRes] = await Promise.all([
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .ilike('city', `%${city}%`),
    supabase
      .from('listings')
      .select('price,deal_type,rooms,size_m2,neighborhood,created_at')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1000),
  ])
  if (sampleRes.error) throw sampleRes.error
  const totalCount = totalRes.count ?? 0

  const rows = sampleRes.data ?? []
  const rents = rows.filter(r => r.deal_type === 'rent'    && r.price).map(r => r.price as number).sort((a, b) => a - b)
  const sales = rows.filter(r => r.deal_type === 'forsale' && r.price).map(r => r.price as number).sort((a, b) => a - b)
  const median = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : null
  const percentile = (arr: number[], p: number) =>
    arr.length ? arr[Math.floor(arr.length * p)] : null
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

  const roomsArr = rows.map(r => r.rooms).filter((x): x is number => typeof x === 'number')
  const sizeArr  = rows.map(r => r.size_m2).filter((x): x is number => typeof x === 'number')
  const sevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000
  const nbhdSet = new Set(rows.map(r => r.neighborhood).filter(Boolean))

  return {
    city,
    total:    totalCount,    // true count from HEAD query, not the sample size
    rentCount: rents.length,
    saleCount: sales.length,
    medianRent: median(rents),
    medianSale: median(sales),
    p25Rent:    percentile(rents, 0.25),
    p75Rent:    percentile(rents, 0.75),
    p25Sale:    percentile(sales, 0.25),
    p75Sale:    percentile(sales, 0.75),
    avgRooms:   avg(roomsArr),
    avgSize:    avg(sizeArr),
    neighborhoodCount: nbhdSet.size,
    newWithin7d: rows.filter(r => r.created_at && new Date(r.created_at).getTime() > sevenDays).length,
  }
}

export default function CityCompare() {
  const { i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const cityA = params.get('a') ?? 'תל אביב יפו'
  const cityB = params.get('b') ?? 'ירושלים'

  const [statsA, setStatsA] = useState<CityStats | null>(null)
  const [statsB, setStatsB] = useState<CityStats | null>(null)
  const [loading, setLoading] = useState(true)

  useSeo({
    title: `${translateCity(cityA, i18n.language)} vs ${translateCity(cityB, i18n.language)} - Real Estate Comparison | BebKey`,
    description: `Compare real estate in ${translateCity(cityA, i18n.language)} and ${translateCity(cityB, i18n.language)} - median rent and sale prices, room sizes, freshness, and more.`,
    url: `https://www.bebkey.com/compare?a=${encodeURIComponent(cityA)}&b=${encodeURIComponent(cityB)}`,
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchStats(cityA), fetchStats(cityB)])
      .then(([a, b]) => { setStatsA(a); setStatsB(b) })
      .catch((e) => { console.error(e); setStatsA(null); setStatsB(null) })
      .finally(() => setLoading(false))
  }, [cityA, cityB])

  function swap() {
    setParams({ a: cityB, b: cityA })
  }
  function change(which: 'a' | 'b', city: string) {
    setParams({ a: which === 'a' ? city : cityA, b: which === 'b' ? city : cityB })
  }

  const { t } = useTranslation()

  const label = (key: string) => {
    const dict: Record<string, Record<string, string>> = {
      title: { he: 'השוואת ערים', en: 'City Comparison', ru: 'Сравнение городов', fr: 'Comparaison des villes', ar: 'مقارنة المدن' },
      total: { he: 'סה"כ דירות', en: 'Total listings', ru: 'Всего объявлений', fr: 'Annonces totales', ar: 'إجمالي القوائم' },
      medianRent: { he: 'שכירות חציונית', en: 'Median rent', ru: 'Медианная аренда', fr: 'Loyer médian', ar: 'متوسط الإيجار' },
      medianSale: { he: 'מכירה חציונית', en: 'Median sale price', ru: 'Медианная цена', fr: 'Prix médian', ar: 'متوسط سعر البيع' },
      avgRooms: { he: 'ממוצע חדרים', en: 'Avg. rooms', ru: 'Средние комнаты', fr: 'Pièces (moy.)', ar: 'متوسط الغرف' },
      avgSize: { he: 'ממוצע מ"ר', en: 'Avg. size (sqm)', ru: 'Средняя площадь', fr: 'Superficie (moy.)', ar: 'متوسط المساحة' },
      neighborhoods: { he: 'שכונות', en: 'Neighborhoods', ru: 'Районы', fr: 'Quartiers', ar: 'الأحياء' },
      newWeek: { he: 'חדשות השבוע', en: 'Listed this week', ru: 'За неделю', fr: 'Cette semaine', ar: 'هذا الأسبوع' },
      swap: { he: 'החלף', en: 'Swap', ru: 'Поменять', fr: 'Échanger', ar: 'تبديل' },
      cityA: { he: 'עיר א\'', en: 'City A', ru: 'Город A', fr: 'Ville A', ar: 'المدينة أ' },
      cityB: { he: 'עיר ב\'', en: 'City B', ru: 'Город Б', fr: 'Ville B', ar: 'المدينة ب' },
      seeListings: { he: 'דירות ב', en: 'Listings in', ru: 'Объявления в', fr: 'Annonces à', ar: 'قوائم في' },
    }
    return dict[key]?.[i18n.language] ?? dict[key]?.en ?? key
  }

  const cards = useMemo(() => [
    { stats: statsA, which: 'a' as const, color: 'blue' },
    { stats: statsB, which: 'b' as const, color: 'orange' },
  ], [statsA, statsB])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl md:text-4xl font-extrabold mb-2 text-gray-900">
        {label('title')}
      </h1>
      <p className="text-gray-600 mb-6">
        {t('cityCompare.subtitle')}
      </p>

      {/* City selectors + swap */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <CitySelect label={label('cityA')} value={cityA} onChange={(v) => change('a', v)} colorClass="border-blue-300" />
        <button
          onClick={swap}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition"
          aria-label={label('swap')}
        >⇄ {label('swap')}</button>
        <CitySelect label={label('cityB')} value={cityB} onChange={(v) => change('b', v)} colorClass="border-orange-300" />
      </div>

      {/* Stats grid */}
      <div className="grid md:grid-cols-2 gap-5">
        {cards.map(({ stats, color }, idx) => {
          const other = idx === 0 ? statsB : statsA
          const ringColor = color === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
          const textColor = color === 'blue' ? 'text-brand-blue' : 'text-brand-orange'
          if (!stats) {
            return (
              <div key={idx} className={`rounded-2xl border ${ringColor} p-6 text-center text-gray-500`}>
                {loading ? '...' : 'No data'}
              </div>
            )
          }
          return (
            <div key={stats.city} className={`rounded-2xl border ${ringColor} p-6 space-y-3`}>
              <h2 className={`text-2xl font-bold ${textColor}`}>
                {translateCity(stats.city, i18n.language)}
              </h2>
              <StatRow label={label('total')}         value={stats.total.toLocaleString('he-IL')} />
              <StatRow label={label('medianRent')}    value={fmt(stats.medianRent) + (stats.medianRent ? '/mo' : '')}
                                                     delta={pct(stats.medianRent, other?.medianRent ?? null)} />
              <StatRow label={label('medianSale')}    value={fmt(stats.medianSale)}
                                                     delta={pct(stats.medianSale, other?.medianSale ?? null)} />
              <StatRow label={label('avgRooms')}      value={stats.avgRooms ? stats.avgRooms.toFixed(1) : '-'} />
              <StatRow label={label('avgSize')}       value={stats.avgSize ? `${Math.round(stats.avgSize)} m²` : '-'} />
              <Link
                to={`/neighborhoods/${encodeURIComponent(stats.city)}`}
                className="flex justify-between items-baseline border-b border-gray-100 py-1.5 hover:text-brand-blue group"
              >
                <span className="text-sm text-gray-600 group-hover:text-brand-blue">{label('neighborhoods')}</span>
                <span className="font-semibold text-gray-900 group-hover:text-brand-blue">
                  {stats.neighborhoodCount} ›
                </span>
              </Link>
              <StatRow label={label('newWeek')}       value={stats.newWithin7d.toString()} />

              {/* Rent percentile bar (p25 → p75 with median pin) */}
              {stats.medianRent && stats.p25Rent && stats.p75Rent && (
                <RentBar label={label('medianRent')}
                         p25={stats.p25Rent} median={stats.medianRent} p75={stats.p75Rent}
                         currency="₪/mo" />
              )}
              {stats.medianSale && stats.p25Sale && stats.p75Sale && (
                <RentBar label={label('medianSale')}
                         p25={stats.p25Sale} median={stats.medianSale} p75={stats.p75Sale}
                         currency="₪" />
              )}

              <Link
                to={`/search?city=${encodeURIComponent(stats.city)}`}
                className="block text-center mt-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:border-brand-blue transition"
              >
                {label('seeListings')} {translateCity(stats.city, i18n.language)} ({stats.total.toLocaleString('he-IL')}) →
              </Link>
            </div>
          )
        })}
      </div>

      {/* Disclaimer */}
      <p className="mt-8 text-xs text-gray-500 text-center">
        {t('cityCompare.disclaimer')}
      </p>
    </div>
  )
}

// ── Small components ───────────────────────────────────────────────────────
function CitySelect({
  label, value, onChange, colorClass,
}: { label: string; value: string; onChange: (v: string) => void; colorClass: string }) {
  const { i18n } = useTranslation()
  return (
    <div className="flex-1">
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border-2 rounded-xl bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue ${colorClass}`}
      >
        {ANCHOR_CITIES.map(c => (
          <option key={c} value={c}>{translateCity(c, i18n.language)}</option>
        ))}
      </select>
    </div>
  )
}

function StatRow({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  return (
    <div className="flex justify-between items-baseline border-b border-gray-100 last:border-0 py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">
        {value}
        {delta && delta !== '≈ same' && (
          <span className={`ml-2 text-xs font-medium ${delta.startsWith('-') ? 'text-green-600' : 'text-red-600'}`}>
            {delta}
          </span>
        )}
      </span>
    </div>
  )
}

function RentBar({ label, p25, median, p75, currency }: {
  label: string; p25: number; median: number; p75: number; currency: string
}) {
  const range = p75 - p25
  const pos = range > 0 ? Math.round(((median - p25) / range) * 100) : 50
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-500 mb-1">{label} (p25 - p75)</p>
      <div className="relative h-3 bg-gray-200 rounded-full overflow-visible">
        <div className="absolute top-0 bottom-0 bg-blue-200 rounded-full"
             style={{ left: '0%', right: '0%' }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-brand-blue rounded-full border-2 border-white"
          style={{ left: `${pos}%` }}
          aria-label={`Median ${fmt(median)}`}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{fmt(p25)}</span>
        <span className="font-semibold text-gray-900">{fmt(median)}{currency.includes('/mo') ? '/mo' : ''}</span>
        <span>{fmt(p75)}</span>
      </div>
    </div>
  )
}
