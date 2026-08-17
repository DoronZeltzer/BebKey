import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'

interface Row {
  city: string
  deal_type: 'forsale' | 'rent'
  listing_count: number
  avg_price: number | null
  median_price: number | null
  avg_price_per_m2: number | null
  avg_rooms: number | null
  avg_size_m2: number | null
  last_listing_at: string | null
}

type DealFilter = 'forsale' | 'rent'

function formatPrice(p: number | null): string {
  if (p == null) return '-'
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(2)}M`
  if (p >= 1_000)     return `₪${(p / 1_000).toFixed(0)}K`
  return `₪${p}`
}

export default function NeighborhoodInsights() {
  const { t } = useTranslation()
  useSeo({
    title:       t('neighborhoodPage.seoTitle'),
    description: t('neighborhoodPage.seoDescription'),
    url:         'https://www.bebkey.com/market',
  })

  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [deal, setDeal]       = useState<DealFilter>('forsale')
  const [sortKey, setSortKey] = useState<keyof Row>('listing_count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('neighborhood_stats')
      .select('*')
      .order('listing_count', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && Array.isArray(data)) setRows(data as Row[])
        setLoading(false)
      }, () => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const visible = rows
    .filter(r => r.deal_type === deal)
    .sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number
      const bv = (b[sortKey] ?? 0) as number
      return sortDir === 'asc' ? av - bv : bv - av
    })

  function toggleSort(k: keyof Row) {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {t('neighborhoodPage.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {t('neighborhoodPage.subtitle', { count: visible.length || rows.length || '?' })}
          </p>
        </div>

        {/* Deal-type toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setDeal('forsale')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              deal === 'forsale'
                ? 'bg-brand-blue text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
            }`}
          >
            {t('search.forSale') || 'For sale'}
          </button>
          <button
            onClick={() => setDeal('rent')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              deal === 'rent'
                ? 'bg-brand-blue text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
            }`}
          >
            {t('search.forRent') || 'For rent'}
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <Th label={t('neighborhoodPage.city')} k="city" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label={t('neighborhoodPage.listings')} k="listing_count" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label={t('neighborhoodPage.median')} k="median_price" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label={t('neighborhoodPage.avg')} k="avg_price" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label={t('neighborhoodPage.perM2')} k="avg_price_per_m2" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label={t('neighborhoodPage.rooms')} k="avg_rooms" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label={t('neighborhoodPage.size')} k="avg_size_m2" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">{t('common.loading') || 'Loading...'}</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">{t('neighborhoodPage.empty')}</td></tr>
                ) : visible.map((r, i) => (
                  <tr key={r.city} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      <Link
                        to={`/city/${encodeURIComponent(r.city)}`}
                        className="hover:text-brand-blue hover:underline"
                      >
                        {r.city}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.listing_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{formatPrice(r.median_price)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatPrice(r.avg_price)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {r.avg_price_per_m2 ? `₪${r.avg_price_per_m2.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.avg_rooms ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.avg_size_m2 ?? '-'}</td>
                    {/* Per-row CTAs - drill into search, compare, or neighborhoods */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition" style={{opacity: 1}}>
                        <Link
                          to={`/search?city=${encodeURIComponent(r.city)}&dealType=${r.deal_type}`}
                          className="text-[11px] px-2 py-1 bg-brand-blue text-white rounded-md hover:bg-blue-700 transition"
                          title={t('neighborhoodPage.actionListings')}
                        >
                          {t('neighborhoodPage.actionListings')}
                        </Link>
                        <Link
                          to={`/compare?a=${encodeURIComponent(r.city)}&b=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91%20%D7%99%D7%A4%D7%95`}
                          className="text-[11px] px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded-md hover:border-brand-blue hover:text-brand-blue transition"
                          title={t('neighborhoodPage.actionCompare')}
                        >
                          {t('neighborhoodPage.actionCompare')}
                        </Link>
                        <Link
                          to={`/neighborhoods/${encodeURIComponent(r.city)}`}
                          className="text-[11px] px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded-md hover:border-brand-blue hover:text-brand-blue transition"
                          title={t('neighborhoodPage.actionAreas')}
                        >
                          {t('neighborhoodPage.actionAreas')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          {t('neighborhoodPage.refreshed')}
        </p>
      </div>
    </div>
  )
}

function Th({
  label, k, sortKey, dir, onClick, align = 'left',
}: {
  label: string
  k: keyof Row
  sortKey: keyof Row
  dir: 'asc' | 'desc'
  onClick: (k: keyof Row) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === k
  return (
    <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 ${active ? 'text-brand-blue' : 'hover:text-gray-900'}`}>
        {label}
        <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '·'}</span>
      </button>
    </th>
  )
}
