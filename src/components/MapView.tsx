import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet/dist/leaflet.css'
import type { Listing } from '../types/listing'
import { getCityCoords, deterministicOffset } from '../lib/cityCoords'
import { translateCity } from '../lib/cityNames'
import { useTranslation } from 'react-i18next'

export interface MapBounds {
  south: number
  west:  number
  north: number
  east:  number
}

interface Props {
  listings: Listing[]
  loading?: boolean
  totalAll?: number                                // total results count (may exceed loaded listings)
  onBoundsChange?: (bounds: MapBounds) => void     // emitted ~400ms after every pan/zoom
  /** When this changes, the auto-fit-to-listings is suppressed so user pan/zoom isn't fought */
  freezeViewport?: boolean
}

// ── Price formatting ──────────────────────────────────────────────────────────
function formatPriceBubble(price: number | null): string {
  if (!price) return '-'
  if (price >= 1_000_000) return `₪${(price / 1_000_000).toFixed(1)}M`
  if (price >= 1_000)     return `₪${Math.round(price / 1_000)}K`
  return `₪${price.toLocaleString('he-IL')}`
}

function formatPriceFull(price: number | null, isRent: boolean): string {
  if (!price) return '-'
  const formatted = `₪${price.toLocaleString('he-IL')}`
  return isRent ? `${formatted} / mo` : formatted
}

// ── Price heatmap colour ──────────────────────────────────────────────────────
// Returns a background colour reflecting price per m² (or rent/m²/month).
// Ranges calibrated to Israeli market reality (2024-2026).
function priceHeatColor(price: number | null, size_m2: number | null, isRent: boolean): string {
  if (!price || !size_m2 || size_m2 <= 0) return isRent ? '#F97316' : '#1A56DB'
  const ppm2 = price / size_m2
  if (isRent) {
    // Rent: ₪/m²/month
    if (ppm2 < 60)  return '#16a34a'   // green  - budget
    if (ppm2 < 100) return '#d97706'   // amber  - mid
    if (ppm2 < 150) return '#ea580c'   // orange - above average
    return '#dc2626'                   // red    - expensive
  } else {
    // Sale: ₪/m²
    if (ppm2 < 10_000) return '#16a34a'   // green  - budget
    if (ppm2 < 20_000) return '#d97706'   // amber  - mid
    if (ppm2 < 30_000) return '#ea580c'   // orange - above average
    return '#dc2626'                      // red    - expensive
  }
}

// ── Price-label marker icon ───────────────────────────────────────────────────
function makePriceIcon(price: number | null, size_m2: number | null, isRent: boolean) {
  const label = formatPriceBubble(price)
  const bg    = priceHeatColor(price, size_m2, isRent)
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};color:white;
      padding:4px 9px;border-radius:20px;
      font-size:12px;font-weight:700;
      white-space:nowrap;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      border:2px solid white;
      transition:transform .15s;
    " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">${label}</div>`,
    iconAnchor: [28, 14],
    iconSize:   [56, 28],
  })
}

// ── Auto-fit bounds when listings change ─────────────────────────────────────
function BoundsController({ points, freeze }: { points: [number, number][]; freeze?: boolean }) {
  const map  = useMap()
  const prev = useRef<string>('')
  useEffect(() => {
    if (freeze) return
    if (!points.length) return
    const key = points.map(p => p.join(',')).join('|')
    if (key === prev.current) return
    prev.current = key
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [map, points, freeze])
  return null
}

// ── Emit map bounds on pan/zoom (debounced ~400ms) ───────────────────────────
function BoundsEmitter({ onChange }: { onChange: (b: MapBounds) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const map = useMapEvents({
    moveend: () => schedule(),
    zoomend: () => schedule(),
  })
  function schedule() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const b = map.getBounds()
      onChange({
        south: b.getSouth(),
        west:  b.getWest(),
        north: b.getNorth(),
        east:  b.getEast(),
      })
    }, 400)
  }
  return null
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapView({ listings, loading, totalAll, onBoundsChange, freezeViewport }: Props) {
  const { i18n } = useTranslation()

  // Fix Leaflet default icon (broken in Vite)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({ iconUrl: '', iconRetinaUrl: '', shadowUrl: '' })
  }, [])

  // Build positioned markers
  const markers = listings.flatMap(l => {
    const base = (l.lat != null && l.lng != null)
      ? [l.lat, l.lng] as [number, number]
      : getCityCoords(l.city)
    if (!base) return []
    const [dLat, dLng] = deterministicOffset(l.id)
    const pos: [number, number] = [base[0] + dLat, base[1] + dLng]
    return [{ l, pos }]
  })

  const points = markers.map(m => m.pos)

  // Default center on Israel
  const defaultCenter: [number, number] = [31.5, 34.9]

  const showingAll  = listings.length === (totalAll ?? listings.length)
  const extraCount  = totalAll != null ? totalAll - listings.length : 0

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 140px)', minHeight: 500 }}>
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[999] bg-white/60 flex items-center justify-center rounded-2xl">
          <div className="flex items-center gap-2 bg-white shadow-lg rounded-xl px-5 py-3 text-sm font-medium text-gray-700">
            <svg className="animate-spin w-4 h-4 text-brand-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading map...
          </div>
        </div>
      )}

      {/* Price heatmap legend */}
      {!loading && markers.length > 0 && (
        <div className="absolute bottom-4 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 px-3 py-2 text-[10px] font-medium text-gray-600">
          <p className="font-semibold text-gray-700 mb-1.5 text-[11px]">Price / m²</p>
          {[
            { color: '#16a34a', label: 'Budget' },
            { color: '#d97706', label: 'Mid' },
            { color: '#ea580c', label: 'Above avg' },
            { color: '#dc2626', label: 'Premium' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 mb-1">
              <span style={{ background: color }} className="w-3 h-3 rounded-full flex-shrink-0 block" />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Result count badge */}
      {!loading && markers.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] pointer-events-none">
          <div className="bg-white shadow-md rounded-full px-4 py-1.5 text-xs font-semibold text-gray-700 border border-gray-100">
            {markers.length.toLocaleString()} listings on map
            {!showingAll && extraCount > 0 && (
              <span className="text-gray-400"> · {extraCount.toLocaleString()} more - zoom or filter to narrow</span>
            )}
          </div>
        </div>
      )}

      <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <MapContainer
          center={defaultCenter}
          zoom={8}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {points.length > 0 && <BoundsController points={points} freeze={freezeViewport} />}
          {onBoundsChange && <BoundsEmitter onChange={onBoundsChange} />}

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            showCoverageOnHover={false}
            iconCreateFunction={(cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount()
              return L.divIcon({
                html: `<div style="
                  background:#1A56DB;color:white;
                  width:40px;height:40px;border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  font-size:13px;font-weight:700;
                  box-shadow:0 2px 8px rgba(0,0,0,0.3);
                  border:3px solid white;
                ">${count > 99 ? '99+' : count}</div>`,
                className: '',
                iconSize:   L.point(40, 40),
                iconAnchor: L.point(20, 20),
              })
            }}
          >
            {markers.map(({ l, pos }) => {
              const isRent      = l.deal_type === 'rent'
              const cityDisplay = translateCity(l.city, i18n.language)
              const img         = l.images?.[0]
              return (
                <Marker key={l.id} position={pos} icon={makePriceIcon(l.price, l.size_m2, isRent)}>
                  <Popup minWidth={200} maxWidth={240}>
                    <div>
                      {img && (
                        <img
                          src={img} alt="" referrerPolicy="no-referrer"
                          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block' }}
                        />
                      )}
                      <p style={{ fontWeight: 700, fontSize: 15, color: isRent ? '#F97316' : '#1A56DB', margin: '0 0 3px' }}>
                        {formatPriceFull(l.price, isRent)}
                      </p>
                      <p style={{ fontSize: 12, color: '#374151', margin: '0 0 3px', fontWeight: 500 }}>
                        {[l.street, l.neighborhood, cityDisplay].filter(Boolean).join(', ')}
                      </p>
                      {l.property_type && (
                        <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 3px' }}>{l.property_type}</p>
                      )}
                      <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 10px' }}>
                        {[
                          l.rooms != null  && `${l.rooms} rooms`,
                          l.size_m2 != null && `${l.size_m2} m²`,
                          l.floor != null  && `Floor ${l.floor}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                      <Link
                        to={`/listing/${l.id}`}
                        style={{
                          display: 'block', background: '#1A56DB', color: 'white',
                          textAlign: 'center', padding: '6px 0', borderRadius: 8,
                          fontSize: 12, fontWeight: 600, textDecoration: 'none',
                        }}
                      >
                        View listing →
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  )
}
