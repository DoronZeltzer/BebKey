import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { ADMIN_EMAILS } from '../lib/adminEmails'

const PAGE_SIZE = 25

// ── Types ─────────────────────────────────────────────────────────────────────
interface Listing {
  id: string
  source: string | null
  source_url: string | null
  price: number | null
  city: string | null
  rooms: number | null
  size_m2: number | null
  deal_type: 'forsale' | 'rent' | null
  is_active: boolean
  created_at?: string
  property_type: string | null
  view_count: number | null
}

type KnownSource = 'madlan' | 'yad2' | 'janglo' | 'onmap' | 'facebook' | 'facebook_groups' | 'komo' | 'telegram' | 'jpost'
type SourceFilter = 'all' | KnownSource | 'manual'
type StatusFilter = 'all' | 'active' | 'inactive'
type SortCol = 'source' | 'city' | 'price' | 'rooms' | 'size_m2' | 'deal_type' | 'is_active' | 'created_at' | 'view_count'
type SortDir = 'asc' | 'desc'

interface ScraperInfo {
  key: KnownSource
  label: string
  color: string       // tailwind text color
  bg: string          // tailwind badge bg
  textColor: string   // tailwind badge text
}

const SCRAPERS: ScraperInfo[] = [
  { key: 'yad2',           label: 'Yad2',           color: 'text-orange-600',  bg: 'bg-orange-100',  textColor: 'text-orange-800'  },
  { key: 'madlan',         label: 'Madlan',         color: 'text-blue-600',    bg: 'bg-blue-100',    textColor: 'text-blue-800'    },
  { key: 'janglo',         label: 'Janglo',         color: 'text-emerald-600', bg: 'bg-emerald-100', textColor: 'text-emerald-800' },
  { key: 'onmap',          label: 'OnMap',          color: 'text-violet-600',  bg: 'bg-violet-100',  textColor: 'text-violet-800'  },
  { key: 'facebook',       label: 'Facebook Mkt',   color: 'text-sky-600',     bg: 'bg-sky-100',     textColor: 'text-sky-800'     },
  { key: 'facebook_groups',label: 'FB Groups',      color: 'text-indigo-600',  bg: 'bg-indigo-100',  textColor: 'text-indigo-800'  },
  { key: 'komo',           label: 'Komo',           color: 'text-amber-600',   bg: 'bg-amber-100',   textColor: 'text-amber-800'   },
  { key: 'telegram',       label: 'Telegram',       color: 'text-cyan-600',    bg: 'bg-cyan-100',    textColor: 'text-cyan-800'    },
  { key: 'jpost',          label: 'Jerusalem Post', color: 'text-red-600',     bg: 'bg-red-100',     textColor: 'text-red-800'     },
]

interface ScraperStats {
  count: number
  lastScraped: string | null  // ISO timestamp of newest listing
}
type AllScraperStats = Record<KnownSource, ScraperStats>

interface GlobalStats {
  total: number
  active: number
}

interface ReportedListing {
  id: string
  listing_id: string
  created_at: string
  listing?: {
    id: string
    city: string | null
    price: number | null
    source: string | null
    is_active: boolean
    images: string[]
  } | null
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: string | null }) {
  const scraper = SCRAPERS.find(s => s.key === source)
  if (scraper) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${scraper.bg} ${scraper.textColor}`}>
        {scraper.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
      {source ?? 'manual'}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
      {t('admin.active')}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      {t('admin.inactive')}
    </span>
  )
}

// ── Freshness helpers ─────────────────────────────────────────────────────────
function freshnessLabel(lastScraped: string | null, count: number) {
  if (count === 0 || !lastScraped) return { key: 'admin.never',  cls: 'bg-gray-100 text-gray-500' }
  const hoursAgo = (Date.now() - new Date(lastScraped).getTime()) / 3_600_000
  if (hoursAgo < 30)  return { key: 'admin.fresh',  cls: 'bg-green-100 text-green-700' }
  if (hoursAgo < 168) return { key: 'admin.recent', cls: 'bg-yellow-100 text-yellow-700' }
  return { key: 'admin.stale', cls: 'bg-red-100 text-red-600' }
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return '-'
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Admin() {
  const { t } = useTranslation()
  useSeo({ title: 'Admin Panel | BebKey' })

  const { user, loading: authLoading } = useAuth()

  const [listings, setListings] = useState<Listing[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ total: 0, active: 0 })
  const [scraperStats, setScraperStats] = useState<AllScraperStats>(() =>
    Object.fromEntries(SCRAPERS.map(s => [s.key, { count: 0, lastScraped: null }])) as AllScraperStats
  )
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportedListings, setReportedListings] = useState<ReportedListing[]>([])
  const [reportedCount, setReportedCount] = useState(0)
  const [telegramRecent, setTelegramRecent] = useState<Array<{
    id: string
    source_url: string | null
    title: string | null
    city: string | null
    price: number | null
    rooms: number | null
    deal_type: string | null
    created_at: string
    is_active: boolean
  }>>([])
  const [telegramChannels, setTelegramChannels] = useState<Array<{
    channel: string
    count: number
    lastSeen: string
  }>>([])

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [citySearch, setCitySearch] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const isAdmin = !authLoading && !!user?.email && ADMIN_EMAILS.has(user.email)

  // ── Fetch scraper stats (count + last scraped per source) ─────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      // Global totals
      const [totalRes, activeRes] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      setGlobalStats({
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
      })

      // Reported listings
      const reportedRes = await supabase
        .from('reported_listings')
        .select('id, listing_id, created_at, listing:listings(id,city,price,source,is_active,images)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(20)
      setReportedCount(reportedRes.count ?? 0)
      setReportedListings((reportedRes.data ?? []) as unknown as ReportedListing[])

      // Per-scraper: count + newest created_at
      const results = await Promise.all(
        SCRAPERS.map(s =>
          supabase
            .from('listings')
            .select('created_at', { count: 'exact' })
            .eq('source', s.key)
            .order('created_at', { ascending: false })
            .limit(1)
        )
      )

      const newStats = { ...scraperStats }
      results.forEach((res, i) => {
        const key = SCRAPERS[i].key
        newStats[key] = {
          count: res.count ?? 0,
          lastScraped: res.data?.[0]?.created_at ?? null,
        }
      })
      setScraperStats(newStats)

      // ── Telegram detail: 25 most recent + per-channel breakdown ──────────
      const tgRes = await supabase
        .from('listings')
        .select('id, source_url, title, city, price, rooms, deal_type, created_at, is_active')
        .eq('source', 'telegram')
        .order('created_at', { ascending: false })
        .limit(25)
      setTelegramRecent((tgRes.data ?? []) as typeof telegramRecent)

      // Group all telegram listings by channel (parsed from source_url)
      const tgAllRes = await supabase
        .from('listings')
        .select('source_url, created_at')
        .eq('source', 'telegram')
        .order('created_at', { ascending: false })
        .limit(500)
      const byChannel = new Map<string, { count: number; lastSeen: string }>()
      for (const row of tgAllRes.data ?? []) {
        const url = row.source_url ?? ''
        const match = url.match(/t\.me\/([^\/]+)\//)
        if (!match) continue
        const channel = match[1]
        const existing = byChannel.get(channel)
        if (!existing) {
          byChannel.set(channel, { count: 1, lastSeen: row.created_at })
        } else {
          existing.count += 1
        }
      }
      setTelegramChannels(
        Array.from(byChannel.entries())
          .map(([channel, info]) => ({ channel, ...info }))
          .sort((a, b) => b.count - a.count)
      )
    } finally {
      setStatsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch listings table ──────────────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    setDataLoading(true)
    setError(null)

    let query = supabase
      .from('listings')
      .select(
        'id, source, source_url, price, city, rooms, size_m2, deal_type, is_active, created_at, property_type, view_count',
        { count: 'exact' }
      )
      .order(sortCol, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (sourceFilter !== 'all') {
      query = query.eq('source', sourceFilter)
    }
    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }
    if (citySearch.trim()) {
      query = query.ilike('city', `%${citySearch.trim()}%`)
    }

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setListings((data as Listing[]) ?? [])
      setTotalCount(count ?? 0)
    }
    setDataLoading(false)
  }, [page, sourceFilter, statusFilter, citySearch, sortCol, sortDir])

  useEffect(() => {
    if (isAdmin) fetchStats()
  }, [isAdmin, fetchStats])

  useEffect(() => {
    if (isAdmin) fetchListings()
  }, [isAdmin, fetchListings])

  async function toggleActive(listing: Listing) {
    setTogglingId(listing.id)
    const { error: updateError } = await supabase
      .from('listings')
      .update({ is_active: !listing.is_active })
      .eq('id', listing.id)

    if (!updateError) {
      setListings(prev =>
        prev.map(l => (l.id === listing.id ? { ...l, is_active: !l.is_active } : l))
      )
      setGlobalStats(prev => ({
        ...prev,
        active: prev.active + (listing.is_active ? -1 : 1),
      }))
    }
    setTogglingId(null)
  }

  function handleCitySearch() { setCitySearch(cityInput); setPage(0) }
  function handleClearSearch() { setCityInput(''); setCitySearch(''); setPage(0) }
  function handleSourceChange(v: SourceFilter) { setSourceFilter(v); setPage(0) }
  function handleStatusChange(v: StatusFilter) { setStatusFilter(v); setPage(0) }
  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  function formatPrice(price: number | null) {
    if (price == null) return '-'
    return '₪' + price.toLocaleString()
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">{t('common.loading')}</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-10 text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">{t('admin.accessDenied')}</h1>
          <p className="text-gray-500 text-sm">{t('admin.accessDeniedDesc')}</p>
        </div>
      </div>
    )
  }

  // ── Admin panel ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('admin.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('admin.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/seo"
              className="text-sm font-medium text-[#1A56DB] bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg"
            >
              SEO Dashboard ↗
            </a>
            <button
              onClick={fetchStats}
              disabled={statsLoading}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              <span className={statsLoading ? 'animate-spin inline-block' : ''}>↻</span>
              {t('admin.refresh')}
            </button>
            <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              {user.email}
            </div>
          </div>
        </div>

        {/* Global stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t('admin.totalListings')} value={globalStats.total} color="text-gray-800" />
          <StatCard label={t('admin.active')} value={globalStats.active} color="text-green-600" />
          <StatCard
            label={t('admin.inactive')}
            value={globalStats.total - globalStats.active}
            color="text-gray-400"
          />
          <StatCard label={t('admin.reported')} value={reportedCount} color={reportedCount > 0 ? 'text-red-500' : 'text-gray-400'} />
        </div>

        {/* ── Reported Listings ──────────────────────────────────────────────── */}
        {reportedListings.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {t('admin.reportedListings')} ({reportedCount})
            </h2>
            <div className="flex flex-col gap-2">
              {reportedListings.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-red-100 p-3 flex items-center gap-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-11 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {r.listing?.images?.[0] ? (
                      <img src={r.listing.images[0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-800">{r.listing?.city ?? '-'}</span>
                      {r.listing?.price && (
                        <span className="text-gray-500">₪{r.listing.price.toLocaleString()}</span>
                      )}
                      <SourceBadge source={r.listing?.source ?? null} />
                      {r.listing && !r.listing.is_active && (
                        <span className="text-xs text-gray-400 italic">already inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Reported {timeAgo(r.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <a
                      href={`/listing/${r.listing_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition"
                    >
                      View
                    </a>
                    {r.listing?.is_active && (
                      <button
                        onClick={async () => {
                          await supabase.from('listings').update({ is_active: false }).eq('id', r.listing_id)
                          setReportedListings(prev => prev.map(x => x.id === r.id
                            ? { ...x, listing: x.listing ? { ...x.listing, is_active: false } : x.listing }
                            : x
                          ))
                          setGlobalStats(prev => ({ ...prev, active: prev.active - 1 }))
                        }}
                        className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scraper Status ──────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            {t('admin.scraperStatus')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {SCRAPERS.map(scraper => {
              const stats = scraperStats[scraper.key]
              const fresh = freshnessLabel(stats.lastScraped, stats.count)
              return (
                <div
                  key={scraper.key}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex flex-col gap-2"
                >
                  {/* Source name + freshness */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">{scraper.label}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${fresh.cls}`}>
                      {t(fresh.key)}
                    </span>
                  </div>

                  {/* Count */}
                  <div className={`text-2xl font-bold ${scraper.color}`}>
                    {statsLoading ? (
                      <span className="text-gray-300 text-lg">-</span>
                    ) : (
                      stats.count.toLocaleString()
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{t('admin.listings')}</div>

                  {/* Last scraped */}
                  <div className="text-xs text-gray-500 border-t border-gray-50 pt-2 mt-auto">
                    {stats.count === 0 ? (
                      <span className="text-gray-400 italic">{t('admin.notYetScraped')}</span>
                    ) : (
                      <>
                        <span className="text-gray-400">{t('admin.last')} </span>
                        <span className="font-medium text-gray-600">
                          {timeAgo(stats.lastScraped)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Quick filter button */}
                  {/* Toggle button */}
                  <button
                    onClick={() => handleSourceChange(sourceFilter === scraper.key ? 'all' : scraper.key)}
                    className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors bg-white"
                  >
                    <span className={`text-xs font-medium transition-colors ${
                      sourceFilter === scraper.key ? scraper.textColor : 'text-gray-500'
                    }`}>
                      {t('admin.filterTable')}
                    </span>
                    {/* Toggle track */}
                    <span
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                        sourceFilter === scraper.key ? scraper.bg.replace('100', '400') : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                          sourceFilter === scraper.key ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Telegram Monitor (always visible) ─────────────────────────────── */}
        {(
          <div className="bg-white rounded-2xl shadow-sm border border-cyan-100 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-50 to-white px-5 py-3 border-b border-cyan-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cyan-700 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.13-3.05-2 1.94c-.23.23-.42.42-.83.42z"/>
                </svg>
                Telegram Live Feed
              </h2>
              <span className="text-xs text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">
                {scraperStats.telegram?.count.toLocaleString() ?? 0} total · last {timeAgo(scraperStats.telegram?.lastScraped ?? null)}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
              {/* Channels breakdown */}
              <div className="lg:col-span-1 border-r border-gray-100 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Active Channels ({telegramChannels.length})
                </h3>
                {telegramChannels.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No channel activity yet</p>
                ) : (
                  <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                    {telegramChannels.map(ch => (
                      <li key={ch.channel} className="flex items-center justify-between text-xs">
                        <a
                          href={`https://t.me/${ch.channel}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-700 hover:underline truncate flex-1"
                        >
                          @{ch.channel}
                        </a>
                        <span className="text-gray-600 font-semibold ml-2">{ch.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recent messages */}
              <div className="lg:col-span-2 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Latest Messages
                </h3>
                {telegramRecent.length === 0 ? (
                  <div className="text-xs text-gray-400 italic space-y-1">
                    <p>No Telegram listings yet.</p>
                    <p>Next scrape will populate this - first run kicks off at 06:00 / 18:00 IL time, or trigger a manual run from GitHub Actions.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {telegramRecent.map(l => (
                      <li key={l.id} className="py-2 flex items-start gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {l.city && (
                              <span className="font-semibold text-gray-800 text-sm">{l.city}</span>
                            )}
                            {l.deal_type === 'rent' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700">rent</span>
                            )}
                            {l.deal_type === 'forsale' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">sale</span>
                            )}
                            {l.price && (
                              <span className="text-gray-600 font-medium">₪{l.price.toLocaleString()}</span>
                            )}
                            {l.rooms && (
                              <span className="text-gray-500">{l.rooms}R</span>
                            )}
                            {!l.is_active && (
                              <span className="text-[10px] text-gray-400 italic">inactive</span>
                            )}
                          </div>
                          <p className="text-gray-500 truncate">
                            {l.title ?? '-'}
                          </p>
                        </div>
                        <a
                          href={l.source_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-600 hover:text-cyan-800 text-xs whitespace-nowrap flex-shrink-0"
                        >
                          {timeAgo(l.created_at)} →
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Source filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('admin.source')}
              </label>
              <select
                value={sourceFilter}
                onChange={e => handleSourceChange(e.target.value as SourceFilter)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">{t('admin.allSources')}</option>
                {SCRAPERS.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
                <option value="manual">{t('admin.manual')}</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('admin.status')}
              </label>
              <select
                value={statusFilter}
                onChange={e => handleStatusChange(e.target.value as StatusFilter)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">{t('admin.allStatuses')}</option>
                <option value="active">{t('admin.activeOnly')}</option>
                <option value="inactive">{t('admin.inactiveOnly')}</option>
              </select>
            </div>

            {/* City search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('admin.searchCity')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCitySearch()}
                  placeholder={t('admin.cityPlaceholder')}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCitySearch}
                  className="bg-[#1A56DB] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t('admin.search')}
                </button>
                {citySearch && (
                  <button
                    onClick={handleClearSearch}
                    className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
                  >
                    {t('admin.clear')}
                  </button>
                )}
              </div>
            </div>

            {/* Reset all filters */}
            {(sourceFilter !== 'all' || statusFilter !== 'all' || citySearch) && (
              <button
                onClick={() => {
                  handleSourceChange('all')
                  handleStatusChange('all')
                  handleClearSearch()
                }}
                className="text-xs text-gray-400 hover:text-gray-700 underline self-end pb-2"
              >
                {t('admin.resetFilters')}
              </button>
            )}
          </div>
        </div>

        {/* ── Table card ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-500">
              {dataLoading ? `${t('admin.loadingListings')}` : (
                <>
                  {t('admin.showing')}{' '}
                  <span className="font-semibold text-gray-800">
                    {totalCount === 0 ? 0 : page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)}
                  </span>{' '}
                  {t('admin.of')}{' '}
                  <span className="font-semibold text-gray-800">{totalCount.toLocaleString()}</span>{' '}
                  {t('admin.listings')}
                  {sourceFilter !== 'all' && (
                    <span className="ml-2 text-gray-400">
                      ({t('admin.filtered')} <span className="font-medium">{sourceFilter}</span>)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          {error && (
            <div className="px-5 py-4 bg-red-50 text-red-700 text-sm">
              Error: {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <Th col="source"     label={t('admin.colSource')} align="left"   active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="city"       label={t('admin.colCity')}   align="left"   active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="price"      label={t('admin.colPrice')}  align="right"  active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="rooms"      label={t('admin.colRooms')}  align="right"  active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="size_m2"    label={t('admin.colSize')}   align="right"  active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="deal_type"  label={t('admin.colDeal')}   align="left"   active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="is_active"  label={t('admin.colStatus')} align="left"   active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="view_count" label={t('admin.colViews')}  align="right"  active={sortCol} dir={sortDir} onSort={handleSort} />
                  <Th col="created_at" label={t('admin.colCreated')}align="left"   active={sortCol} dir={sortDir} onSort={handleSort} />
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{t('admin.colToggle')}</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-400">
                      {t('admin.loadingListings')}
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-400">
                      {t('admin.noListings')}
                    </td>
                  </tr>
                ) : (
                  listings.map((listing, idx) => (
                    <tr
                      key={listing.id}
                      className={
                        idx % 2 === 0
                          ? 'bg-white hover:bg-gray-50 transition-colors'
                          : 'bg-gray-50/60 hover:bg-gray-100 transition-colors'
                      }
                    >
                      <td className="px-4 py-3">
                        <a
                          href={listing.source_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:opacity-75 transition-opacity"
                          title={listing.source_url ?? ''}
                        >
                          <SourceBadge source={listing.source} />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                        {listing.city ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap font-medium">
                        {formatPrice(listing.price)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {listing.rooms ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {listing.size_m2 != null ? Math.round(listing.size_m2) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {listing.deal_type === 'forsale' ? (
                          <span className="text-blue-700 font-medium">{t('admin.forSale')}</span>
                        ) : listing.deal_type === 'rent' ? (
                          <span className="text-emerald-700 font-medium">{t('admin.rent')}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={listing.is_active} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                        {listing.view_count != null && listing.view_count > 0
                          ? listing.view_count.toLocaleString()
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(listing.created_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(listing)}
                          disabled={togglingId === listing.id}
                          aria-label={listing.is_active ? 'Deactivate listing' : 'Activate listing'}
                          className={`
                            relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1
                            ${listing.is_active
                              ? 'bg-green-500 focus:ring-green-400'
                              : 'bg-gray-300 focus:ring-gray-400'}
                            ${togglingId === listing.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <span
                            className={`
                              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                              ${listing.is_active ? 'translate-x-4' : 'translate-x-0.5'}
                            `}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || dataLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('admin.prev')}
              </button>
              <span className="text-sm text-gray-500">
                {t('admin.page')}{' '}
                <span className="font-semibold text-gray-800">{page + 1}</span>{' '}
                {t('admin.of')}{' '}
                <span className="font-semibold text-gray-800">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || dataLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('admin.next')}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

// ── Sortable table header ─────────────────────────────────────────────────────
function Th({
  col, label, align, active, dir, onSort,
}: {
  col: SortCol
  label: string
  align: 'left' | 'right'
  active: SortCol
  dir: SortDir
  onSort: (col: SortCol) => void
}) {
  const isActive = active === col
  return (
    <th
      className={`px-4 py-3 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 font-semibold text-sm transition-colors select-none ${
          isActive ? 'text-[#1A56DB]' : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {label}
        <span className="flex flex-col leading-none text-[10px]">
          <span className={isActive && dir === 'asc'  ? 'text-[#1A56DB]' : 'text-gray-300'}>▲</span>
          <span className={isActive && dir === 'desc' ? 'text-[#1A56DB]' : 'text-gray-300'}>▼</span>
        </span>
      </button>
    </th>
  )
}
