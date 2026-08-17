/**
 * /open-houses — list of upcoming open-house events across all listings.
 * Pulls listings.open_house_at IS NOT NULL ordered by event date.
 * Grouped by day for easy weekend scanning.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import { translateCity } from '../lib/cityNames'

interface Row {
  id:              string
  open_house_at:   string
  open_house_note: string | null
  city:            string
  neighborhood:    string | null
  street:          string | null
  price:           number | null
  rooms:           number | null
  size_m2:         number | null
  deal_type:       'forsale' | 'rent'
  images:          string[] | null
  property_type:   string | null
}

function formatDateHeader(iso: string, lang: string): string {
  const d = new Date(iso)
  const dateFmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return dateFmt.format(d)
}

function formatTime(iso: string, lang: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: lang !== 'he',
  }).format(d)
}

function formatPrice(p: number | null, isRent: boolean, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!p) return t('openHouses.priceOnRequest')
  const suffix = isRent ? t('openHouses.perMonthShort') : ''
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p % 1_000_000 === 0 ? 0 : 2)}M${suffix}`
  if (p >= 1_000)     return `₪${Math.round(p / 1_000)}K${suffix}`
  return `₪${p.toLocaleString('he-IL')}${suffix}`
}

export default function OpenHouses() {
  const { t, i18n } = useTranslation()

  useSeo({
    title:       t('openHouses.seoTitle'),
    description: t('openHouses.seoDescription'),
    url:         'https://www.bebkey.com/open-houses',
  })

  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const nowIso = new Date().toISOString()

    supabase
      .from('listings')
      .select('id,open_house_at,open_house_note,city,neighborhood,street,price,rooms,size_m2,deal_type,images,property_type')
      .eq('is_active', true)
      .not('open_house_at', 'is', null)
      .gte('open_house_at', nowIso)
      .order('open_house_at', { ascending: true })
      .limit(300)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          // If the open_house_at column doesn't exist yet (migration not
          // run), silently show the empty state instead of an error -
          // it's a setup step, not a runtime bug.
          const msg = err.message || ''
          if (msg.includes('open_house_at') || err.code === '42703') {
            setRows([])
          } else {
            setError(t('openHouses.loadError'))
          }
        } else {
          setRows((data ?? []) as Row[])
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Group rows by YYYY-MM-DD (in Israel TZ)
  const byDay = rows.reduce<Record<string, Row[]>>((acc, r) => {
    const d = new Date(r.open_house_at)
    const key = d.toISOString().slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-1">
          {t('openHouses.title')}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('openHouses.subtitle', { count: rows.length })}
        </p>

        {/* Filter chips - city, deal_type would go here in a later iteration */}

        {loading && (
          <div className="text-center py-16 text-gray-400">
            <svg className="animate-spin w-6 h-6 mx-auto mb-3 text-brand-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {t('common.loading') || 'Loading...'}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-lg font-semibold text-gray-700 mb-1">
              {t('openHouses.empty')}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {t('openHouses.emptyDesc')}
            </p>
            <Link to="/search" className="inline-block bg-brand-blue text-white font-semibold rounded-xl px-5 py-2.5 text-sm hover:bg-blue-700 transition">
              {t('openHouses.browseListings')}
            </Link>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-8">
            {Object.entries(byDay).map(([day, items]) => (
              <section key={day}>
                <h2 className="text-lg font-bold text-gray-900 mb-3 sticky top-0 bg-gray-50 py-2 z-10">
                  <span className="inline-block bg-brand-blue text-white text-xs uppercase tracking-wider font-bold rounded-md px-2.5 py-1 me-2 align-middle">
                    {formatDateHeader(items[0].open_house_at, i18n.language)}
                  </span>
                  <span className="text-gray-400 text-sm font-normal">
                    {items.length} {items.length === 1 ? t('openHouses.eventOne') : t('openHouses.eventOther')}
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(r => {
                    const isRent = r.deal_type === 'rent'
                    const img    = r.images?.[0]
                    const loc    = [r.neighborhood, translateCity(r.city, i18n.language)].filter(Boolean).join(' · ')
                    const stats  = [
                      r.rooms != null ? `${r.rooms} ${t('openHouses.roomShort')}` : null,
                      r.size_m2 != null ? `${r.size_m2} m²` : null,
                    ].filter(Boolean).join(' · ')

                    return (
                      <Link
                        key={r.id}
                        to={`/listing/${r.id}`}
                        className="bg-white rounded-2xl border border-gray-100 hover:border-brand-blue hover:shadow-md transition flex overflow-hidden group"
                      >
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-28 h-28 object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className={`w-28 h-28 flex-shrink-0 ${isRent ? 'bg-orange-100' : 'bg-blue-100'}`}>
                            <div className="w-full h-full flex items-center justify-center text-3xl opacity-50">
                              {isRent ? '🔑' : '🏠'}
                            </div>
                          </div>
                        )}
                        <div className="p-3 min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${isRent ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-brand-blue'}`}>
                              🗓 {formatTime(r.open_house_at, i18n.language)}
                            </span>
                          </div>
                          <p className="font-bold text-gray-900 truncate group-hover:text-brand-blue transition" style={{ color: isRent ? '#F97316' : '#1A56DB' }}>
                            {formatPrice(r.price, isRent, t)}
                          </p>
                          <p className="text-xs text-gray-700 font-medium truncate mt-0.5">{loc || 'Israel'}</p>
                          <p className="text-[11px] text-gray-500 truncate">{stats}</p>
                          {r.open_house_note && (
                            <p className="text-[10px] text-gray-400 truncate mt-1 italic">"{r.open_house_note}"</p>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
