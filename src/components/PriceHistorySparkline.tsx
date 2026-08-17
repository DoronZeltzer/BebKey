/**
 * PriceHistorySparkline
 * ────────────────────────────────────────────────────────────────────────────
 * Inline 120×32 SVG sparkline showing the price trajectory of a single
 * listing, plus a tiny caption summarising the most recent change.
 *
 * Data comes from the `price_history` table (one row per change).  If the
 * listing has never had a price change, this component renders nothing.
 *
 * Why no chart library?  Bundle weight.  A sparkline is ~30 lines of
 * trigonometry-free SVG - adding chart.js (~120kB gzipped) for it would be
 * absurd.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

interface PricePoint {
  changed_at: string
  new_price:  number
}

interface Props {
  listingId:    string
  currentPrice: number | null
}

export default function PriceHistorySparkline({ listingId, currentPrice }: Props) {
  const { t, i18n } = useTranslation()
  const [points, setPoints] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Use the same RPC as PriceHistoryChart so a single function-cache
    // entry covers both renderers.
    supabase
      .rpc('get_price_history', { p_listing_id: listingId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && Array.isArray(data)) setPoints(data as PricePoint[])
        setLoading(false)
      }, () => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [listingId])

  if (loading || points.length < 1 || !currentPrice) return null

  // Compose the full series: every recorded change + the current price.
  // Each "change" row stores the NEW price after the change, so appending
  // currentPrice gives us a point for "today".
  const series: PricePoint[] = [
    ...points,
    { changed_at: new Date().toISOString(), new_price: currentPrice },
  ]
  if (series.length < 2) return null

  const minP = Math.min(...series.map(p => p.new_price))
  const maxP = Math.max(...series.map(p => p.new_price))
  const range = Math.max(1, maxP - minP)

  // Map every point into a (x, y) inside our 120×32 viewBox.
  const W = 120, H = 32, padX = 2, padY = 4
  const xs = series.map((_, i) => padX + (i / (series.length - 1)) * (W - padX * 2))
  const ys = series.map(p => H - padY - ((p.new_price - minP) / range) * (H - padY * 2))
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  // Headline figure: what changed between the last RECORDED point and the
  // current (most-recent) price - that's the freshest information the user
  // can see, even if there were earlier moves.
  const previous = points[points.length - 1].new_price
  const delta    = currentPrice - previous
  const deltaPct = previous > 0 ? Math.round((delta / previous) * 100) : 0
  const wentDown = delta < 0
  const wentUp   = delta > 0

  const lastChangeDate = points[points.length - 1].changed_at
  const dateLabel = new Date(lastChangeDate).toLocaleDateString(
    i18n.language === 'he' ? 'he-IL' :
    i18n.language === 'ru' ? 'ru-RU' :
    i18n.language === 'ar' ? 'ar' :
    i18n.language === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'short', day: 'numeric' },
  )

  const lineColor =
    wentDown ? '#10b981' :  // green-500 - drops are usually good for buyers
    wentUp   ? '#f43f5e' :  // rose-500
               '#6b7280'    // gray-500 - flat

  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="flex-shrink-0"
        role="img"
        aria-label={t('listing.priceHistoryAria', 'Price history chart')}
      >
        <path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot on the most-recent point */}
        <circle
          cx={xs[xs.length - 1]}
          cy={ys[ys.length - 1]}
          r={2.5}
          fill={lineColor}
        />
      </svg>
      <div className={`leading-tight ${wentDown ? 'text-emerald-700' : wentUp ? 'text-rose-700' : 'text-gray-600'}`}>
        <span className="font-semibold">
          {wentDown ? '↓' : wentUp ? '↑' : '↔'} {Math.abs(deltaPct)}%
        </span>
        {' · '}
        <span className="text-gray-500">
          {t('listing.priceHistoryWas', 'Was')} ₪{previous.toLocaleString('he-IL')}
          {' '}{t('listing.priceHistoryOn', 'on')} {dateLabel}
        </span>
      </div>
    </div>
  )
}
