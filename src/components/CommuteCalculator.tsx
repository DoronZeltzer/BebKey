/**
 * Commute time calculator
 * Lets the user enter a destination (workplace, school, etc.) and see how
 * long it takes to drive, walk, or cycle from this listing.
 *
 * Pure OSM: geocoding via Nominatim, routing via OSRM public demo.  No API
 * keys, no vendor lock-in.  If the listing has no exact lat/lng, falls back
 * to the city center from CITY_COORDS.
 *
 * Caches geocoded destinations in localStorage so repeat lookups are instant.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCityCoords } from '../lib/cityCoords'
import { translateCity } from '../lib/cityNames'

interface Props {
  listingLat:  number | null | undefined
  listingLng:  number | null | undefined
  listingCity: string | null | undefined
}

type Mode = 'driving' | 'walking' | 'cycling'

interface Route {
  distanceMeters: number
  durationSeconds: number
  estimated?: boolean   // true when the API fell back to Haversine
}

type Results = Record<Mode, Route | null>

const MODE_META: Record<Mode, { icon: string; key: string }> = {
  driving: { icon: '🚗', key: 'commute.modeDriving' },
  walking: { icon: '🚶', key: 'commute.modeWalking' },
  cycling: { icon: '🚴', key: 'commute.modeCycling' },
}

// Quick suggestions — canonical Hebrew names; translateCity() converts
// per current UI language at render time (supports he/en/ru/ar/fr).
// Ben Gurion Airport isn't a city so it stays as-is and uses inline fallback.
const QUICK_SUGGESTIONS: string[] = [
  'תל אביב יפו',
  'ירושלים',
  'נמל תעופה בן גוריון',
  'חיפה',
]

const GEOCODE_CACHE_KEY = 'bebkey_commute_geocode_cache'
const MAX_CACHE_ENTRIES = 50

interface CachedGeocode {
  query: string
  lat: number
  lng: number
  display: string
}

function loadGeocodeCache(): CachedGeocode[] {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveGeocodeCache(entries: CachedGeocode[]) {
  try {
    const trimmed = entries.slice(-MAX_CACHE_ENTRIES)
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(trimmed))
  } catch {}
}

async function geocode(query: string): Promise<CachedGeocode | null> {
  const cache = loadGeocodeCache()
  const hit = cache.find(c => c.query.toLowerCase() === query.toLowerCase())
  if (hit) return hit

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=il`
  try {
    const r = await fetch(url, {
      headers: {
        // Nominatim asks for an identifying UA / Referer.  Browser sets these
        // automatically; we just include a polite Accept header.
        Accept: 'application/json',
      },
    })
    if (!r.ok) return null
    const data = await r.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (!data.length) return null
    const entry: CachedGeocode = {
      query,
      lat:     parseFloat(data[0].lat),
      lng:     parseFloat(data[0].lon),
      display: data[0].display_name,
    }
    saveGeocodeCache([...cache, entry])
    return entry
  } catch { return null }
}

async function route(
  from: { lat: number; lng: number },
  to:   { lat: number; lng: number },
  mode: Mode,
): Promise<Route | null> {
  // Route through our own /api/route proxy.  Originally we hit
  // router.project-osrm.org directly but ad-blockers (Brave Shields,
  // uBlock Origin) block third-party requests to that domain and users
  // saw "-" for everything.  Proxying through the same origin avoids
  // the block; the API also falls back to a Haversine estimate when
  // OSRM is slow or down.
  const url = `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&mode=${mode}`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json() as { durationSeconds: number; distanceMeters: number; estimated?: boolean }
    if (typeof data.durationSeconds !== 'number') return null
    return {
      durationSeconds: data.durationSeconds,
      distanceMeters:  data.distanceMeters,
      estimated:       !!data.estimated,
    }
  } catch { return null }
}

function formatDuration(seconds: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1)  return t('commute.durationLessMin')
  if (mins < 60) return t('commute.durationMinutes', { count: mins })
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return t('commute.durationHours', { count: h })
  return t('commute.durationHoursMinutes', { h, m })
}

function formatDistance(meters: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const km = meters / 1000
  if (km < 1)  return t('commute.distanceMeters', { count: Math.round(meters) })
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export default function CommuteCalculator({ listingLat, listingLng, listingCity }: Props) {
  const { t, i18n } = useTranslation()

  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [results,  setResults]  = useState<Results | null>(null)
  const [destLabel, setDestLabel] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  // Resolve origin: prefer exact lat/lng, fall back to city center.
  const origin = (() => {
    if (listingLat != null && listingLng != null) {
      return { lat: listingLat, lng: listingLng, exact: true }
    }
    const center = listingCity ? getCityCoords(listingCity) : null
    if (center) return { lat: center[0], lng: center[1], exact: false }
    return null
  })()

  async function compute(q: string) {
    if (!origin) {
      setError(t('commute.errorNoOrigin'))
      return
    }
    setError(null)
    setLoading(true)
    setResults(null)
    setDestLabel(null)

    const dest = await geocode(q)
    if (!dest) {
      setError(t('commute.errorDestNotFound'))
      setLoading(false)
      return
    }
    setDestLabel(dest.display.split(',').slice(0, 2).join(','))

    // Run all 3 modes in parallel
    const [drv, wlk, cyc] = await Promise.all([
      route(origin, dest, 'driving'),
      route(origin, dest, 'walking'),
      route(origin, dest, 'cycling'),
    ])
    setResults({ driving: drv, walking: wlk, cycling: cyc })
    setLoading(false)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    compute(query.trim())
  }

  // Keep input clear on listing change
  useEffect(() => {
    setQuery('')
    setResults(null)
    setDestLabel(null)
    setError(null)
  }, [listingLat, listingLng, listingCity])

  return (
    <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5 mb-1">
        <svg className="w-4 h-4 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {t('commute.title')}
      </h3>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        {t('commute.subtitle')}
        {origin && !origin.exact && (
          <span className="block text-amber-700 mt-0.5">
            {t('commute.cityCenterFallback')}
          </span>
        )}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('commute.placeholder')}
          className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent bg-white"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!query.trim() || loading || !origin}
          className="bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {t('commute.computing')}
            </>
          ) : t('commute.calculate')}
        </button>
      </form>

      {/* Quick-pick suggestions */}
      {!results && !loading && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="text-[11px] text-gray-400 self-center">{t('commute.tryFor')}:</span>
          {QUICK_SUGGESTIONS.map(hebName => {
            const label = translateCity(hebName, i18n.language)
            return (
              <button
                key={hebName}
                type="button"
                onClick={() => { setQuery(label); compute(label) }}
                disabled={loading || !origin}
                className="text-[11px] bg-white border border-gray-200 hover:border-brand-blue hover:text-brand-blue text-gray-600 px-2.5 py-1 rounded-full transition disabled:opacity-50"
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {results && destLabel && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            {t('commute.toLabel')}: <span className="text-gray-700 font-medium normal-case">{destLabel}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_META) as Mode[]).map(mode => {
              const r = results[mode]
              const meta = MODE_META[mode]
              return (
                <div key={mode} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xl mb-0.5">{meta.icon}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-1">
                    {t(meta.key)}
                  </p>
                  {r ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 leading-tight">
                        {r.estimated && '~'}{formatDuration(r.durationSeconds, t)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatDistance(r.distanceMeters, t)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">–</p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            {t('commute.poweredBy')}
          </p>
        </div>
      )}
    </div>
  )
}
