import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

interface PricePoint {
  changed_at: string
  old_price: number | null
  new_price: number
}

interface Props {
  listingId: string
  currentPrice?: number | null
}

/**
 * Inline SVG sparkline of price changes for a single listing.
 * Hidden when fewer than 2 price points exist (no story to tell).
 */
export default function PriceHistoryChart({ listingId, currentPrice }: Props) {
  const { t } = useTranslation()
  const [points, setPoints] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .rpc('get_price_history', { p_listing_id: listingId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && Array.isArray(data)) setPoints(data as PricePoint[])
        setLoading(false)
      }, () => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [listingId])

  // Build the price series: each change adds a point.  We also append the
  // current price as the latest observation so the line goes to "now."
  const series: { ts: number; price: number }[] = []
  points.forEach(p => {
    if (p.old_price && series.length === 0) {
      series.push({
        ts: new Date(p.changed_at).getTime() - 86_400_000, // 1 day before
        price: p.old_price,
      })
    }
    series.push({
      ts: new Date(p.changed_at).getTime(),
      price: p.new_price,
    })
  })
  if (currentPrice != null) {
    const last = series[series.length - 1]
    if (!last || last.price !== currentPrice) {
      series.push({ ts: Date.now(), price: currentPrice })
    }
  }

  if (loading) return null
  if (series.length < 2) return null

  // Compute SVG path
  const W = 280
  const H = 60
  const PAD = 4
  const minP = Math.min(...series.map(p => p.price))
  const maxP = Math.max(...series.map(p => p.price))
  const minT = series[0].ts
  const maxT = series[series.length - 1].ts
  const rangeP = maxP - minP || 1
  const rangeT = maxT - minT || 1

  const toX = (t: number) => PAD + ((t - minT) / rangeT) * (W - 2 * PAD)
  const toY = (p: number) => H - PAD - ((p - minP) / rangeP) * (H - 2 * PAD)

  const path = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.ts).toFixed(1)} ${toY(p.price).toFixed(1)}`)
    .join(' ')

  const dropped =
    series[0].price > series[series.length - 1].price
  const strokeColor = dropped ? '#10b981' : '#f43f5e' // green if dropped, red if went up
  const fillColor   = dropped ? 'rgba(16, 185, 129, 0.10)' : 'rgba(244, 63, 94, 0.10)'

  // First + last labels for context
  const firstPriceStr = `₪${series[0].price.toLocaleString('he-IL')}`
  const lastPriceStr  = `₪${series[series.length - 1].price.toLocaleString('he-IL')}`
  const days = Math.max(1, Math.round((maxT - minT) / 86_400_000))

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('listing.priceHistoryTitle') || 'Price history'}
        </h3>
        <span className="text-xs text-gray-400">
          {days} {t('listing.daysShort') || 'd'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <path
          d={`${path} L ${toX(series[series.length - 1].ts).toFixed(1)} ${H} L ${toX(series[0].ts).toFixed(1)} ${H} Z`}
          fill={fillColor}
        />
        <path d={path} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {series.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.ts)}
            cy={toY(p.price)}
            r={i === 0 || i === series.length - 1 ? 3 : 2}
            fill={strokeColor}
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs mt-2">
        <span className="text-gray-500">{firstPriceStr}</span>
        <span className={`font-semibold ${dropped ? 'text-emerald-600' : 'text-rose-600'}`}>
          {lastPriceStr}
        </span>
      </div>
    </div>
  )
}
