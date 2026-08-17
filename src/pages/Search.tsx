import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'
import { translateCity } from '../lib/cityNames'
import CityCombobox from '../components/CityCombobox'
import { useAuth } from '../context/AuthContext'
import { useSavedListings } from '../hooks/useSavedListings'
import { useSeo } from '../hooks/useSeo'
import AiSearchBar from '../components/AiSearchBar'
import { CITY_COORDS } from '../lib/cityCoords'
import type { MapBounds } from '../components/MapView'
import { trackEvent } from '../components/GoogleAnalytics'

const MapView = lazy(() => import('../components/MapView'))

const PAGE_SIZE = 12
const MAP_LIMIT = 500

const ROOMS_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5+']
const SOURCES = [
  { key: 'yad2',            label: 'Yad2' },
  { key: 'onmap',           label: 'OnMap' },
  { key: 'madlan',          label: 'Madlan' },
  { key: 'janglo',          label: 'Janglo' },
  { key: 'komo',            label: 'Komo' },
  { key: 'telegram',        label: 'Telegram' },
  { key: 'facebook',        label: 'Facebook' },
  { key: 'facebook_groups', label: 'FB Groups' },
  { key: 'jpost',           label: 'Jerusalem Post' },
  { key: 'manual',          label: 'BebKey' },
]
const PROPERTY_TYPES = [
  'דירה', 'דירת גן', 'פרויקט חדש',
  "בית פרטי/ קוטג'", 'דו משפחתי', 'דופלקס', 'טריפלקס',
  "גג/ פנטהאוז", 'יחידת דיור', 'בניין מגורים', 'סטודיו/ לופט',
  'משק חקלאי/ נחלה', 'מגרשים', 'מחסן', 'חניה', 'סאבלט', 'כללי',
]

// Maps English / Russian / Arabic / French / legacy property-type names
// → the canonical Hebrew string that's actually stored in DB.  Without this,
// a URL like ?propertyType=apartment would query `property_type = 'apartment'`
// and match zero rows (DB only has Hebrew values).
const PROPERTY_TYPE_NORMALIZE: Record<string, string> = {
  apartment:                'דירה',
  flat:                     'דירה',
  квартира:                 'דירה',
  appartement:              'דירה',
  شقة:                      'דירה',
  studio:                   'סטודיו/ לופט',
  loft:                     'סטודיו/ לופט',
  לופט:                     'סטודיו/ לופט',
  סטודיו:                   'סטודיו/ לופט',
  penthouse:                'גג/ פנטהאוז',
  פנטהאוז:                  'גג/ פנטהאוז',
  пентхаус:                 'גג/ פנטהאוז',
  mini_penthouse:           'גג/ פנטהאוז',
  'mini-penthouse':         'גג/ פנטהאוז',
  roof_apartment:           'גג/ פנטהאוז',
  garden_apartment:         'דירת גן',
  'garden apartment':       'דירת גן',
  house:                    "בית פרטי/ קוטג'",
  villa:                    "בית פרטי/ קוטג'",
  וילה:                     "בית פרטי/ קוטג'",
  вилла:                    "בית פרטי/ קוטג'",
  maison:                   "בית פרטי/ קוטג'",
  بيت:                      "בית פרטי/ קוטג'",
  cottage:                  "בית פרטי/ קוטג'",
  קוטג:                     "בית פרטי/ קוטג'",
  townhouse:                "בית פרטי/ קוטג'",
  duplex:                   'דופלקס',
  дуплекс:                  'דופלקס',
  triplex:                  'טריפלקס',
  duplex_family:            'דו משפחתי',
  semi_detached:            'דו משפחתי',
  new_project:              'פרויקט חדש',
  parking:                  'חניה',
  storage:                  'מחסן',
  land:                     'מגרשים',
  plot:                     'מגרשים',
  building:                 'בניין מגורים',
  sublet:                   'סאבלט',
  studio_unit:              'יחידת דיור',
  agricultural:             'משק חקלאי/ נחלה',
  farm:                     'משק חקלאי/ נחלה',
}

function normalizePropertyType(input: string): string {
  if (!input) return ''
  // Already a Hebrew canonical value? Pass through.
  if (PROPERTY_TYPES.includes(input)) return input
  // Try lowercase exact match (handles English/transliterations)
  const lower = input.toLowerCase().trim()
  return PROPERTY_TYPE_NORMALIZE[lower] ?? PROPERTY_TYPE_NORMALIZE[input] ?? input
}
const CONDITIONS = ['new', 'renovated', 'needs_work'] as const

// Feature flags: key matches both the UI state key and the DB column (via FEATURE_DB_MAP)
const FEATURE_KEYS = [
  'tabu', 'pinuiBinui', 'tama38', 'mamad',
  'parking', 'elevator', 'balcony', 'storageRoom',
  'animalsAllowed', 'furnished', 'airConditioning', 'accessible',
] as const
type FeatureKey = typeof FEATURE_KEYS[number]

// Maps camelCase UI key → snake_case DB column
const FEATURE_DB_MAP: Record<FeatureKey, string> = {
  tabu:           'tabu',
  pinuiBinui:     'pinui_binui',
  tama38:         'tama_38',
  mamad:          'mamad',
  parking:        'parking',
  elevator:       'elevator',
  balcony:        'balcony',
  storageRoom:    'storage_room',
  animalsAllowed: 'animals_allowed',
  furnished:      'furnished',
  airConditioning:'air_conditioning',
  accessible:     'accessible',
}

type SortOption = 'price_desc' | 'price_asc' | 'size_desc' | 'newest'
type DealType   = '' | 'forsale' | 'rent'
type ViewMode   = 'grid' | 'map'

// ── Session-scoped filter persistence ────────────────────────────────────────
const SEARCH_STORAGE_KEY = 'bebkey_search_filters'

interface PersistedFilters {
  city: string; neighborhood: string; propertyType: string
  priceMin: string; priceMax: string; rooms: string[]
  sizeMin: string; sizeMax: string; dealType: DealType
  condition: string; features: Record<FeatureKey, boolean>
  sortBy: SortOption; viewMode: ViewMode; showAdvanced: boolean
  keyword: string; floorMin: string; floorMax: string; postedWithin: string; source: string
}

function loadSavedFilters(): Partial<PersistedFilters> {
  try {
    const raw = sessionStorage.getItem(SEARCH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function persistFilters(state: PersistedFilters) {
  try { sessionStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(state)) }
  catch {}
}

function clearPersistedFilters() {
  try { sessionStorage.removeItem(SEARCH_STORAGE_KEY) } catch {}
}

interface Filters {
  city: string
  neighborhood: string
  propertyType: string
  priceMin: string
  priceMax: string
  rooms: string[]       // multi-select
  sizeMin: string
  sizeMax: string
  dealType: DealType
  condition: string
  features: Record<FeatureKey, boolean>
  keyword: string
  floorMin: string
  floorMax: string
  postedWithin: string  // '' | '1' | '7' | '30'
  source: string
  /** When set, only listings whose lat/lng OR whose city center falls inside these bounds are returned. */
  mapBounds: MapBounds | null
}

// ── Apply all filters to a Supabase query ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T>(query: T, f: Filters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query
  const { city, neighborhood, propertyType, priceMin, priceMax, rooms, sizeMin, sizeMax, dealType, condition, features, keyword, floorMin, floorMax, postedWithin, source } = f

  if (city.trim())                             q = q.eq('city', city.trim())
  if (neighborhood.trim())                     q = q.ilike('neighborhood', `%${neighborhood.trim()}%`)
  if (propertyType) {
    // Normalize EN/RU/AR/FR property-type names to the canonical Hebrew
    // string stored in DB.  Without this a URL like ?propertyType=apartment
    // would match zero rows because DB only has 'דירה'.
    const canonicalType = normalizePropertyType(propertyType)
    q = q.eq('property_type', canonicalType)
  }
  if (priceMin && !isNaN(parseInt(priceMin)))  q = q.gte('price', parseInt(priceMin))
  if (priceMax && !isNaN(parseInt(priceMax)))  q = q.lte('price', parseInt(priceMax))
  if (sizeMin  && !isNaN(parseInt(sizeMin)))   q = q.gte('size_m2', parseInt(sizeMin))
  if (sizeMax  && !isNaN(parseInt(sizeMax)))   q = q.lte('size_m2', parseInt(sizeMax))
  if (condition)                               q = q.eq('condition', condition)
  if (keyword.trim())                          q = q.ilike('description', `%${keyword.trim()}%`)
  if (source)                                  q = q.eq('source', source)
  if (floorMin && !isNaN(parseInt(floorMin)))  q = q.gte('floor', parseInt(floorMin))
  if (floorMax && !isNaN(parseInt(floorMax)))  q = q.lte('floor', parseInt(floorMax))
  if (postedWithin) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - parseInt(postedWithin))
    q = q.gte('created_at', cutoff.toISOString())
  }

  // Deal type - approximate by price range when deal_type column not present
  if (dealType === 'rent')    q = q.eq('deal_type', 'rent')
  if (dealType === 'forsale') q = q.eq('deal_type', 'forsale')

  // Rooms - multi-select with 5+ support
  if (rooms.length > 0) {
    const specific = rooms.filter(r => r !== '5+').map(parseFloat)
    const hasFivePlus = rooms.includes('5+')
    if (specific.length > 0 && hasFivePlus) {
      q = q.or(`rooms.in.(${specific.join(',')}),rooms.gte.5`)
    } else if (specific.length > 0) {
      q = q.in('rooms', specific)
    } else {
      q = q.gte('rooms', 5)
    }
  }

  // Boolean feature flags
  for (const key of FEATURE_KEYS) {
    if (features[key]) q = q.eq(FEATURE_DB_MAP[key], true)
  }

  // ── Map bounds filter ──
  // Listings WITH lat/lng → filter by exact bounds.
  // Listings WITHOUT lat/lng → include if their city center falls in bounds.
  // PostgREST .or() joins these branches.
  if (f.mapBounds) {
    const { south, west, north, east } = f.mapBounds
    const citiesInBounds = Object.entries(CITY_COORDS)
      .filter(([, [la, ln]]) => la >= south && la <= north && ln >= west && ln <= east)
      .map(([name]) => name)
    const bbox = `and(lat.gte.${south},lat.lte.${north},lng.gte.${west},lng.lte.${east})`
    if (citiesInBounds.length > 0) {
      // PostgREST: comma-separated list inside .in.()
      const cityList = citiesInBounds.map(c => `"${c.replace(/"/g, '\\"')}"`).join(',')
      q = q.or(`${bbox},and(lat.is.null,city.in.(${cityList}))`)
    } else {
      q = q.or(bbox)
    }
  }

  return q
}

function emptyFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) as Record<FeatureKey, boolean>
}

// ── Graceful relaxation ───────────────────────────────────────────────────────
// When a search returns 0 results we don't leave the user with an empty page.
// Instead we drop the least-essential filters ONE AT A TIME (keeping city +
// deal type, the user's core intent) until listings appear, and tell the user
// what we loosened.  This is what makes lifestyle/keyword searches usable: the
// description field is populated for only ~10% of listings, so a keyword filter
// alone would otherwise zero almost everything.
interface RelaxStep {
  key: string
  i18nKey: string          // label shown in the "we loosened X" banner
  applies: (f: Filters) => boolean
  clear: (f: Filters) => Filters
}
const RELAX_STEPS: RelaxStep[] = [
  { key: 'keyword',      i18nKey: 'search.keyword',      applies: f => !!f.keyword.trim(),                    clear: f => ({ ...f, keyword: '' }) },
  { key: 'features',     i18nKey: 'search.features',     applies: f => Object.values(f.features).some(Boolean), clear: f => ({ ...f, features: emptyFeatures() }) },
  { key: 'condition',    i18nKey: 'search.condition',    applies: f => !!f.condition,                          clear: f => ({ ...f, condition: '' }) },
  { key: 'source',       i18nKey: 'admin.source',        applies: f => !!f.source,                             clear: f => ({ ...f, source: '' }) },
  { key: 'floor',        i18nKey: 'listing.floor',       applies: f => !!(f.floorMin || f.floorMax),           clear: f => ({ ...f, floorMin: '', floorMax: '' }) },
  { key: 'postedWithin', i18nKey: 'search.postedWithin', applies: f => !!f.postedWithin,                       clear: f => ({ ...f, postedWithin: '' }) },
  { key: 'neighborhood', i18nKey: 'search.neighborhood', applies: f => !!f.neighborhood.trim(),                clear: f => ({ ...f, neighborhood: '' }) },
  { key: 'size',         i18nKey: 'search.sizeRange',    applies: f => !!(f.sizeMin || f.sizeMax),             clear: f => ({ ...f, sizeMin: '', sizeMax: '' }) },
  { key: 'propertyType', i18nKey: 'search.propertyType', applies: f => !!f.propertyType,                       clear: f => ({ ...f, propertyType: '' }) },
  { key: 'price',        i18nKey: 'search.priceRange',   applies: f => !!(f.priceMin || f.priceMax),           clear: f => ({ ...f, priceMin: '', priceMax: '' }) },
  { key: 'rooms',        i18nKey: 'search.rooms',        applies: f => f.rooms.length > 0,                     clear: f => ({ ...f, rooms: [] }) },
]
function hasRelaxableFilter(f: Filters): boolean {
  return RELAX_STEPS.some(s => s.applies(f))
}

// Parse rooms from URL (comma-separated)
function parseRooms(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').filter(r => ROOMS_OPTIONS.includes(r))
}

// Parse features from URL (?tabu=1&parking=1 ...)
function parseFeaturesFromUrl(params: URLSearchParams): Record<FeatureKey, boolean> {
  const f = emptyFeatures()
  for (const key of FEATURE_KEYS) {
    if (params.get(key) === '1') f[key] = true
  }
  return f
}

export default function Search() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { isSaved, toggleSave } = useSavedListings()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Dynamic SEO - derives from URL params so it's stable on SSR/first paint ─
  const seoCity  = searchParams.get('city') ?? ''
  const seoDeal  = (searchParams.get('dealType') ?? '') as DealType
  const seoTitle = seoCity
    ? `${seoDeal === 'rent' ? 'Rentals' : seoDeal === 'forsale' ? 'Properties for Sale' : 'Properties'} in ${seoCity} | BebKey`
    : 'Search Properties in Israel | BebKey'
  const seoDesc  = seoCity
    ? `Browse ${seoDeal === 'rent' ? 'rental ' : seoDeal === 'forsale' ? 'for-sale ' : ''}property listings in ${seoCity}, Israel. Filter by price, rooms, size and more on BebKey.`
    : 'Filter and browse thousands of Israeli property listings - apartments, villas, rentals and more across all cities.'
  useSeo({
    title: seoTitle,
    description: seoDesc,
    url: 'https://www.bebkey.com/search',
  })

  // ── Filter state - URL params take priority, sessionStorage is the fallback ─
  // This ensures filters survive navigating to a listing and pressing Back,
  // AND survive page refreshes within the same tab session.
  //
  // IMPORTANT: sessionStorage is only used when the URL has NO params at all.
  // If the URL has any params (e.g. ?dealType=rent), those params are fully
  // authoritative - any param absent from the URL defaults to '' (empty).
  // This prevents stale sessionStorage values (e.g. a previous garbled city)
  // from contaminating a fresh navigation with different/partial params.
  const _saved = loadSavedFilters()
  const _hasUrlParams = searchParams.toString().length > 0
  const ss = _hasUrlParams ? {} as Partial<PersistedFilters> : _saved

  const [city,         setCity]         = useState(searchParams.get('city')         || ss.city         || '')
  const [neighborhood, setNeighborhood] = useState(searchParams.get('neighborhood') || ss.neighborhood || '')
  const [priceMin,     setPriceMin]     = useState(searchParams.get('priceMin')     || ss.priceMin     || '')
  const [priceMax,     setPriceMax]     = useState(searchParams.get('priceMax')     || ss.priceMax     || '')
  const [rooms,        setRooms]        = useState<string[]>(
    parseRooms(searchParams.get('rooms')) ||
    (ss.rooms?.length ? ss.rooms : [])
  )
  const [sizeMin,      setSizeMin]      = useState(searchParams.get('sizeMin')      || ss.sizeMin      || '')
  const [sizeMax,      setSizeMax]      = useState(searchParams.get('sizeMax')      || ss.sizeMax      || '')
  const [propertyType, setPropertyType] = useState(searchParams.get('propertyType') || ss.propertyType || '')
  const [dealType,     setDealType]     = useState<DealType>(
    (searchParams.get('dealType') as DealType) || ss.dealType || ''
  )
  const [condition,    setCondition]    = useState(searchParams.get('condition')    || ss.condition    || '')
  const [features,     setFeatures]     = useState<Record<FeatureKey, boolean>>(
    _hasUrlParams ? parseFeaturesFromUrl(searchParams) : (ss.features ?? emptyFeatures())
  )
  const [sortBy,       setSortBy]       = useState<SortOption>(ss.sortBy    ?? 'newest')
  const [viewMode,     setViewMode]     = useState<ViewMode>  (ss.viewMode  ?? 'grid')
  const [showAdvanced, setShowAdvanced] = useState            (ss.showAdvanced ?? false)
  // Whole filter panel collapse. Default open on desktop, collapsed on phones
  // (where the panel eats most of the screen before you see any results).
  const [filtersOpen,  setFiltersOpen]  = useState            (() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  const [keyword,      setKeyword]      = useState            (searchParams.get('keyword')      || ss.keyword      || '')
  const [floorMin,     setFloorMin]     = useState            (searchParams.get('floorMin')     || ss.floorMin     || '')
  const [floorMax,     setFloorMax]     = useState            (searchParams.get('floorMax')     || ss.floorMax     || '')
  const [postedWithin, setPostedWithin] = useState            ((searchParams.get('postedWithin') || ss.postedWithin || '') as '' | '1' | '7' | '30')
  const [source,       setSource]       = useState            (searchParams.get('source')       || ss.source       || '')

  // ── Persist all filter state to sessionStorage on every change ───────────
  // This means filters survive: clicking into a listing + pressing Back,
  // and any in-page navigation. Cleared only when user clicks "Clear".
  useEffect(() => {
    persistFilters({
      city, neighborhood, propertyType, priceMin, priceMax, rooms,
      sizeMin, sizeMax, dealType, condition, features,
      sortBy, viewMode, showAdvanced,
      keyword, floorMin, floorMax, postedWithin, source,
    })
  }, [city, neighborhood, propertyType, priceMin, priceMax, rooms,
      sizeMin, sizeMax, dealType, condition, features,
      sortBy, viewMode, showAdvanced, keyword, floorMin, floorMax, postedWithin, source])

  // ── Grid results ─────────────────────────────────────────────────────────
  const [listings,  setListings]  = useState<Listing[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  // Filter keys we auto-dropped because the exact search had 0 results (drives
  // the "showing closest match — we loosened X" banner).  Empty = exact match.
  const [relaxed,   setRelaxed]   = useState<string[]>([])

  // ── Map results ──────────────────────────────────────────────────────────
  const [mapListings, setMapListings] = useState<Listing[]>([])
  const [mapLoading,  setMapLoading]  = useState(false)
  const [mapTotal,    setMapTotal]    = useState(0)

  // ── Bounds-sync state ─────────────────────────────────────────────────────
  // appliedBounds: the bounds currently used in the active filter (or null)
  // pendingBounds: the bounds the user just panned/zoomed to (different from applied → pill shows)
  const [appliedBounds, setAppliedBounds] = useState<MapBounds | null>(null)
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null)
  // Freeze the auto-fit-to-listings once user has dragged, so pan/zoom stays as user left it
  const [viewportFrozen, setViewportFrozen] = useState(false)

  // ── City dropdown ─────────────────────────────────────────────────────────
  const [cities, setCities] = useState<string[]>([])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const currentFilters = (): Filters => ({
    city, neighborhood, propertyType, priceMin, priceMax, rooms, sizeMin, sizeMax, dealType, condition, features,
    keyword, floorMin, floorMax, postedWithin, source,
    mapBounds: appliedBounds,
  })

  // ── Fetch grid page ───────────────────────────────────────────────────────
  const fetchListings = useCallback(async (targetPage: number) => {
    setLoading(true); setError('')
    const SELECT =
      'id,source,price,city,street,neighborhood,size_m2,rooms,floor,total_floors,property_type,deal_type,condition,' +
      'lat,lng,description,images,is_active,source_url,has_image,quality_score,is_featured,featured_until,previous_price,' +
      'spotlight_until,bump_until,tag_kind,tag_until,' +
      'open_house_at,open_house_note,' +
      'tabu,pinui_binui,tama_38,mamad,parking,elevator,balcony,storage_room,animals_allowed,furnished,air_conditioning,accessible,' +
      'scraped_at,created_at'

    // Build the configured grid query for a given filter set + page range.
    const buildGrid = (f: Filters, from: number, to: number) => {
      let q = supabase
        .from('listings')
        // 'estimated' (planner estimate for big result sets, exact under a
        // threshold) instead of 'exact': an exact count forces a full scan of
        // the ~58k-row table, which blows Supabase's statement timeout on the
        // no-filter "all listings" query. The displayed total can be approximate.
        .select(SELECT, { count: 'estimated' })
        .eq('is_active', true)
        // Data quality guards: exclude impossible prices (spam/test listings).
        // Allow null prices but cap at 50M and floor at 200.
        .or('price.is.null,price.lte.50000000')
        .or('price.is.null,price.gte.200')
        .range(from, to)
      q = q.order('is_featured',   { ascending: false, nullsFirst: false })
      // Bumped listings re-float to the top (a lapsed bump_until is cleared to
      // null by scrapers/expire_boosts.py, so only currently-bumped rows rank up).
      q = q.order('bump_until',    { ascending: false, nullsFirst: false })
      q = q.order('quality_score', { ascending: false, nullsFirst: false })
      q = q.order('has_image',     { ascending: false, nullsFirst: false })
      if (sortBy === 'price_desc')      q = q.order('price',   { ascending: false, nullsFirst: false })
      else if (sortBy === 'price_asc')  q = q.order('price',   { ascending: true,  nullsFirst: false })
      else if (sortBy === 'size_desc')  q = q.order('size_m2', { ascending: false, nullsFirst: false })
      // "Newest" = first discovery (created_at), NOT scraped_at (which refreshes
      // on every run and would surface re-verified old listings as new).
      else                              q = q.order('created_at', { ascending: false, nullsFirst: false })
      return applyFilters(q, f)
    }
    // Lightweight count-only probe used while relaxing filters. 'estimated'
    // (not 'exact') so it doesn't full-scan large sets and hit the statement
    // timeout — we only need to know whether the relaxed set is non-empty.
    const countOnly = async (f: Filters): Promise<number> => {
      let q = supabase.from('listings').select('id', { count: 'estimated', head: true })
        .eq('is_active', true)
        .or('price.is.null,price.lte.50000000')
        .or('price.is.null,price.gte.200')
      q = applyFilters(q, f)
      const { count } = await q
      return count ?? 0
    }

    const base = currentFilters()
    const from = (targetPage - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let { data, error: err, count } = await buildGrid(base, from, to)

    // ── Graceful relaxation: if the exact search is empty, drop filters one at
    //    a time until something matches, then render that "closest" page. ──
    let dropped: string[] = []
    if (!err && (count ?? 0) === 0 && hasRelaxableFilter(base)) {
      let f = base
      for (const step of RELAX_STEPS) {
        if (!step.applies(f)) continue
        f = step.clear(f)
        dropped.push(step.i18nKey)
        const c = await countOnly(f)
        if (c > 0) {
          // Relaxation is deterministic in the base filters, so it resolves to
          // the same level on every page → fetch the requested page range.
          const relaxedPage = await buildGrid(f, from, to)
          data = relaxedPage.data; err = relaxedPage.error; count = relaxedPage.count
          break
        }
      }
      // Nothing matched even fully relaxed → keep the empty (true zero) result.
      if ((count ?? 0) === 0) dropped = []
    }

    if (err) { setError(t('common.error')); setRelaxed([]) }
    else {
      // Client-side safety sort: featured first, then quality.
      const sorted = ((data ?? []) as unknown as Listing[]).sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1
        if (!a.is_featured && b.is_featured) return 1
        const score = (l: Listing) =>
          (l as unknown as Record<string, number>).quality_score ??
          ((l.images?.length ?? 0) > 0 ? 2 : 0)
        return score(b) - score(a)
      })
      setListings(sorted)
      setTotal(count ?? 0)
      setRelaxed(dropped)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, neighborhood, propertyType, priceMin, priceMax, rooms, sizeMin, sizeMax, dealType, condition, features, sortBy, keyword, floorMin, floorMax, postedWithin, source, appliedBounds, t])

  // ── Fetch ALL for map ─────────────────────────────────────────────────────
  const fetchAllForMap = useCallback(async () => {
    setMapLoading(true)
    // 'estimated' count: an exact count of a large deal-filtered set (e.g. all
    // for-sale ~25k rows) full-scans the table and hits Supabase's statement
    // timeout, which broke the map view for broad filters like For Sale.
    let countQ = supabase
      .from('listings')
      .select('id', { count: 'estimated', head: true })
      .eq('is_active', true)
      .or('price.is.null,price.lte.50000000')
      .or('price.is.null,price.gte.200')
    countQ = applyFilters(countQ, currentFilters())
    const { count } = await countQ
    setMapTotal(count ?? 0)

    let q = supabase
      .from('listings')
      .select('id,price,city,street,neighborhood,size_m2,rooms,floor,property_type,deal_type,lat,lng,images,source_url')
      .eq('is_active', true)
      .or('price.is.null,price.lte.50000000')
      .or('price.is.null,price.gte.200')
      // Order by the same rank columns as the grid so this reuses the
      // idx_listings_active_rank_newest index. The old has_image+price sort had
      // no index and full-scanned the table, timing out for broad filters like
      // For Sale (~25k rows). The map just needs the top listings to plot.
      .order('is_featured',   { ascending: false, nullsFirst: false })
      .order('bump_until',    { ascending: false, nullsFirst: false })
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('has_image',     { ascending: false, nullsFirst: false })
      .order('created_at',    { ascending: false, nullsFirst: false })
      .range(0, MAP_LIMIT - 1)
    q = applyFilters(q, currentFilters())

    const { data } = await q
    setMapListings((data ?? []) as Listing[])
    setMapLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, neighborhood, propertyType, priceMin, priceMax, rooms, sizeMin, sizeMax, dealType, condition, features, keyword, floorMin, floorMax, postedWithin, source, appliedBounds])

  // ── Re-fetch whenever applied bounds change ──────────────────────────────
  useEffect(() => {
    fetchListings(1); setPage(1)
    if (viewMode === 'map') fetchAllForMap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedBounds])

  // ── When user changes city / neighborhood, drop bounds filter ────────────
  // (they're signaling a new area of interest; old bounds would zero results)
  const bcityFirstRef = useRef(true)
  useEffect(() => {
    if (bcityFirstRef.current) { bcityFirstRef.current = false; return }
    if (appliedBounds || pendingBounds) {
      setAppliedBounds(null)
      setPendingBounds(null)
      setViewportFrozen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, neighborhood])

  // Apply the user's panned/zoomed area as a filter
  const applyMapArea = useCallback(() => {
    if (!pendingBounds) return
    setAppliedBounds(pendingBounds)
    setPendingBounds(null)
    setViewportFrozen(true)
  }, [pendingBounds])

  const clearMapArea = useCallback(() => {
    setAppliedBounds(null)
    setPendingBounds(null)
    setViewportFrozen(false)
  }, [])

  // Decide whether to show the "Search this area" pill
  // (only when user has panned meaningfully past applied bounds)
  const boundsMeaningfullyDiffer = (a: MapBounds | null, b: MapBounds | null): boolean => {
    if (!b) return false
    if (!a) return true
    const eps = 0.005   // ~500m at Israeli latitude
    return Math.abs(a.south - b.south) > eps ||
           Math.abs(a.north - b.north) > eps ||
           Math.abs(a.east  - b.east ) > eps ||
           Math.abs(a.west  - b.west ) > eps
  }
  const showSearchAreaPill = viewMode === 'map' && boundsMeaningfullyDiffer(appliedBounds, pendingBounds)

  // ── Cities dropdown ───────────────────────────────────────────────────────
  // Uses the get_distinct_cities() RPC to get ALL distinct cities in one call,
  // bypassing PostgREST's 1000-row default limit that would truncate the list.
  useEffect(() => {
    supabase.rpc('get_distinct_cities')
      .then(({ data }) => {
        const cities = (Array.isArray(data) ? data : []) as string[]
        setCities(cities.sort((a, b) => a.localeCompare(b, 'he')))
      })
  }, [])

  // ── Initial load ──────────────────────────────────────────────────────────
  // Track whether dealType / sortBy effects are running for the first time
  // so we don't double-fetch on mount ([] effect already handles initial load)
  const dealTypeFirstRef = useRef(true)
  const sortByFirstRef   = useRef(true)

  useEffect(() => { fetchListings(1); setPage(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When dealType changes (after mount), re-fetch with the NEW callback which
  // has the correct dealType baked in. The setTimeout(0) trick doesn't work
  // because it captures a stale closure.
  useEffect(() => {
    if (dealTypeFirstRef.current) { dealTypeFirstRef.current = false; return }
    fetchListings(1); setPage(1)
    if (viewMode === 'map') fetchAllForMap()
  }, [dealType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sortByFirstRef.current) { sortByFirstRef.current = false; return }
    fetchListings(page)
  }, [sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode === 'map') fetchAllForMap()
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rooms toggle (multi-select with range fill) ───────────────────────────
  // When the user clicks two chips that aren't adjacent (e.g. 2 and 5), we
  // automatically fill in everything between so the selection is contiguous.
  // This matches Yad2/OnMap behavior and is what users expect when picking a
  // range. Clicking an already-selected chip still de-selects only that one.
  function toggleRoom(r: string) {
    setRooms(prev => {
      // De-select: user is un-clicking an active chip
      if (prev.includes(r)) return prev.filter(x => x !== r)

      // First selection ever — just add it
      if (prev.length === 0) return [r]

      // Build the contiguous range [min(prev ∪ r) … max(prev ∪ r)] against
      // the canonical ROOMS_OPTIONS order. Preserves "5+" as an atomic option.
      const merged = [...prev, r]
      const idxs = merged.map(x => ROOMS_OPTIONS.indexOf(x)).filter(i => i >= 0)
      if (idxs.length === 0) return merged
      const lo = Math.min(...idxs)
      const hi = Math.max(...idxs)
      return ROOMS_OPTIONS.slice(lo, hi + 1)
    })
  }

  // ── Feature toggle ────────────────────────────────────────────────────────
  function toggleFeature(key: FeatureKey) {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Apply / Clear ─────────────────────────────────────────────────────────
  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    const p: Record<string, string> = {}
    if (city)                      p.city         = city
    if (neighborhood)              p.neighborhood = neighborhood
    if (priceMin)                  p.priceMin     = priceMin
    if (priceMax)                  p.priceMax     = priceMax
    if (rooms.length)              p.rooms        = rooms.join(',')
    if (sizeMin)                   p.sizeMin      = sizeMin
    if (sizeMax)                   p.sizeMax      = sizeMax
    if (propertyType)              p.propertyType = propertyType
    if (dealType)                  p.dealType     = dealType
    if (condition)                 p.condition    = condition
    for (const key of FEATURE_KEYS) {
      if (features[key]) p[key] = '1'
    }
    if (keyword)      p.keyword      = keyword
    if (floorMin)     p.floorMin     = floorMin
    if (floorMax)     p.floorMax     = floorMax
    if (postedWithin) p.postedWithin = postedWithin
    if (source)       p.source       = source
    setSearchParams(p)
    // GA4 search event - lets us see which filter combos drive engagement
    trackEvent('search', {
      search_term:   keyword || city || neighborhood || '',
      city:          city || undefined,
      deal_type:     dealType || undefined,
      property_type: propertyType || undefined,
      rooms:         rooms.length ? rooms.join(',') : undefined,
      price_max:     priceMax || undefined,
    })
    if (viewMode === 'map') { fetchAllForMap(); fetchListings(1) }
    else { fetchListings(1); setPage(1) }
  }

  function handleClear() {
    clearPersistedFilters()
    setCity(''); setNeighborhood(''); setPriceMin(''); setPriceMax(''); setRooms([])
    setSizeMin(''); setSizeMax(''); setPropertyType(''); setDealType(''); setCondition('')
    setFeatures(emptyFeatures()); setKeyword(''); setFloorMin(''); setFloorMax(''); setPostedWithin(''); setSource('')
    setSearchParams({})
    fetchListings(1); setPage(1)
    if (viewMode === 'map') fetchAllForMap()
  }

  function handleDealType(dt: DealType) {
    setDealType(dt)
    // Fetch is triggered by the useEffect([dealType]) below - no stale closure issue
  }

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return
    setPage(p); fetchListings(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function pageNumbers(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = [1]
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
    return pages
  }

  // ── Save Search ───────────────────────────────────────────────────────────
  const [savedSearch,  setSavedSearch]  = useState(false)
  const [savingSearch, setSavingSearch] = useState(false)

  async function handleSaveSearch() {
    if (!user) return
    setSavingSearch(true)
    const parts: string[] = []
    if (city)     parts.push(city)
    if (dealType) parts.push(dealType)
    if (priceMin || priceMax) parts.push(`₪${priceMin || '0'}-${priceMax || '∞'}`)
    if (rooms.length) parts.push(`${rooms.join('/')} ${t('search.rooms')}`)
    const name = parts.join(' · ') || 'Saved Search'
    await supabase.from('filters').insert({
      user_id:       user.id,
      name,
      city:          city || null,
      price_min:     priceMin ? parseInt(priceMin) : null,
      price_max:     priceMax ? parseInt(priceMax) : null,
      rooms_min:     rooms.length ? Math.min(...rooms.filter(r => r !== '5+').map(parseFloat)) : null,
      size_min:      sizeMin ? parseInt(sizeMin) : null,
      property_type: propertyType || null,
      deal_type:     dealType || null,
      is_active:     true,
      notify_email:  user.email ?? null,   // auto-enable email alerts for the signed-in user
    })
    setSavingSearch(false)
    setSavedSearch(true)
    setTimeout(() => setSavedSearch(false), 3000)
  }

  // ── Count active advanced filters for the badge ───────────────────────────
  const advancedCount =
    (condition ? 1 : 0) +
    (floorMin || floorMax ? 1 : 0) +
    (source ? 1 : 0) +
    FEATURE_KEYS.filter(k => features[k]).length

  // Total active filters — shown as a badge on the collapsed filter header so
  // the user can see at a glance that filters are applied even when hidden.
  const activeFilterCount =
    (city ? 1 : 0) + (neighborhood ? 1 : 0) + (propertyType ? 1 : 0) +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (sizeMin ? 1 : 0) + (sizeMax ? 1 : 0) +
    (rooms.length ? 1 : 0) + (postedWithin ? 1 : 0) + advancedCount

  // ── Pill button helper ────────────────────────────────────────────────────
  function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          active
            ? 'bg-brand-blue text-white border-brand-blue'
            : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue hover:text-brand-blue'
        }`}
      >
        {children}
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* AI search bar - collapsed/compact form that re-parses a free-text
          query into filters via /api/ai-search.  Sits above the filter row
          so users can refine their query without leaving the page. */}
      <div className="mb-4 bg-gradient-to-r from-blue-50 to-orange-50 rounded-xl p-3 border border-blue-100">
        <AiSearchBar variant="compact" />
      </div>

      {/* ── Deal type + view toggle row ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
          {(['', 'forsale', 'rent'] as DealType[]).map(dt => (
            <button key={dt} onClick={() => handleDealType(dt)}
              className={`px-4 py-2 transition ${dealType === dt ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {dt === '' ? t('search.all') : dt === 'forsale' ? t('search.forSale') : t('search.forRent')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white">
            <option value="price_desc">{t('search.sortPriceDesc')}</option>
            <option value="price_asc">{t('search.sortPriceAsc')}</option>
            <option value="size_desc">{t('search.sortSizeDesc')}</option>
            <option value="newest">{t('search.sortNewest')}</option>
          </select>

          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
            <button onClick={() => setViewMode('grid')}
              className={`px-3 py-2 flex items-center gap-1.5 transition ${viewMode === 'grid' ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              {t('search.viewGrid')}
            </button>
            <button onClick={() => setViewMode('map')}
              className={`px-3 py-2 flex items-center gap-1.5 transition ${viewMode === 'map' ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {t('search.viewMap')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter panel ── */}
      <form onSubmit={handleApply}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 space-y-4">

        {/* Collapse / expand the whole filter panel */}
        <button
          type="button"
          onClick={() => setFiltersOpen(v => !v)}
          aria-expanded={filtersOpen}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {t('search.filters')}
            {activeFilterCount > 0 && (
              <span className="bg-brand-orange text-gray-900 text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {filtersOpen && (<>

        {/* Row 1: City | Neighborhood | Type | Price min | Price max | Size
            Keyword field removed — free-text search now lives in the AI bar above. */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.city')}</label>
            <CityCombobox
              value={city}
              cities={cities}
              onChange={setCity}
              placeholder={t('search.allCities')}
              allLabel={t('search.allCities')}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.neighborhood')}</label>
            <input type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder={t('search.neighborhood')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>

          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.propertyType')}</label>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white">
              <option value="">{t('search.allTypes')}</option>
              {PROPERTY_TYPES.map(pt => (
                <option key={pt} value={pt}>{t(`listing.propertyTypes.${pt}`, pt)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.priceMin')}</label>
            <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)}
              min={0} step={1} placeholder="0"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>

          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.priceMax')}</label>
            <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)}
              min={0} step={1} placeholder="∞"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>

          <div className="flex flex-col gap-1 min-w-[100px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.sizeMin')}</label>
            <input type="number" value={sizeMin} onChange={e => setSizeMin(e.target.value)}
              min={0} step={10} placeholder="0 m²"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>

          <div className="flex flex-col gap-1 min-w-[100px]">
            <label className="text-xs text-gray-500 font-medium">{t('search.sizeMax')}</label>
            <input type="number" value={sizeMax} onChange={e => setSizeMax(e.target.value)}
              min={0} step={10} placeholder="∞ m²"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>
        </div>

        {/* Row 2: Rooms multi-select pills */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-2">{t('search.rooms')}</label>
          <div className="flex flex-wrap gap-2">
            {ROOMS_OPTIONS.map(r => (
              <Pill key={r} active={rooms.includes(r)} onClick={() => toggleRoom(r)}>
                {r}
              </Pill>
            ))}
            {rooms.length > 0 && (
              <button type="button" onClick={() => setRooms([])}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 underline">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Date posted filter */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-2">{t('search.postedWithin')}</label>
          <div className="flex flex-wrap gap-2">
            {([['', 'postedWithinAny'], ['1', 'postedWithinToday'], ['7', 'postedWithinWeek'], ['30', 'postedWithinMonth']] as const).map(([val, key]) => (
              <Pill key={val} active={postedWithin === val} onClick={() => setPostedWithin(val)}>
                {t(`search.${key}`)}
              </Pill>
            ))}
          </div>
        </div>

        {/* Advanced filters toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-2 text-sm text-brand-blue font-medium hover:underline"
        >
          <span>{t('search.moreFilters')}</span>
          {advancedCount > 0 && (
            <span className="bg-brand-orange text-gray-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {advancedCount}
            </span>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Advanced section */}
        {showAdvanced && (
          <div className="border-t border-gray-100 pt-4 space-y-4">

            {/* Condition */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">{t('search.condition')}</label>
              <div className="flex flex-wrap gap-2">
                <Pill active={condition === ''} onClick={() => setCondition('')}>
                  {t('search.conditionAny')}
                </Pill>
                {CONDITIONS.map(c => (
                  <Pill key={c} active={condition === c} onClick={() => setCondition(c)}>
                    {t(`search.condition${c.charAt(0).toUpperCase() + c.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase())}` as never, c)}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Floor range */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">{t('listing.floor')}</label>
              <div className="flex gap-2 items-center">
                <input type="number" value={floorMin} onChange={e => setFloorMin(e.target.value)}
                  min={-2} step={1} placeholder={t('search.floorMin')}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue w-28" />
                <span className="text-gray-400 text-sm">-</span>
                <input type="number" value={floorMax} onChange={e => setFloorMax(e.target.value)}
                  min={0} step={1} placeholder={t('search.floorMax')}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue w-28" />
              </div>
            </div>

            {/* Source filter */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">{t('admin.source')}</label>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white w-full max-w-xs">
                <option value="">{t('admin.allSources')}</option>
                {SOURCES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Feature flags */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">{t('search.features')}</label>
              <div className="flex flex-wrap gap-2">
                {FEATURE_KEYS.map(key => (
                  <Pill key={key} active={features[key]} onClick={() => toggleFeature(key)}>
                    {t(`search.${key}`)}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          <button type="submit"
            className="px-5 py-2 bg-brand-blue text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm">
            {t('search.apply')}
          </button>
          <button type="button" onClick={handleClear}
            className="px-4 py-2 border border-gray-200 text-gray-600 font-semibold rounded-lg hover:bg-gray-50 transition text-sm">
            {t('search.clear')}
          </button>
          {user && (
            <button
              type="button"
              onClick={handleSaveSearch}
              disabled={savingSearch}
              className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition ${
                savedSearch
                  ? 'bg-green-500 text-white border-green-500'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {savedSearch ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {t('search.saveSearch')}
                </>
              )}
            </button>
          )}
        </div>
        </>)}
      </form>

      {/* ── Relaxed-search banner: shown when we auto-loosened filters to find
          the closest listings (so the user is never left with an empty page). */}
      {viewMode === 'grid' && !loading && relaxed.length > 0 && total > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="text-lg leading-none" aria-hidden="true">💡</span>
          <span>{t('search.relaxedNotice', { filters: relaxed.map(k => t(k)).join(', ') })}</span>
        </div>
      )}

      {/* ── Results count ── */}
      {viewMode === 'grid' && !loading && (
        <p className="text-sm text-gray-500 mb-4">
          {total.toLocaleString()} {t('search.results')}
          {totalPages > 1 && (
            <span className="ml-2 text-gray-400">
              · {t('search.page')} {page} {t('search.of')} {totalPages}
            </span>
          )}
        </p>
      )}

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* ── MAP VIEW ── */}
      {viewMode === 'map' && (
        <div className="relative">
          {/* "Search this area" pill - appears after user pans/zooms to new bounds */}
          {showSearchAreaPill && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
              <button
                onClick={applyMapArea}
                className="bg-brand-blue hover:bg-blue-700 text-white shadow-lg rounded-full px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition transform hover:scale-105"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {t('search.searchThisArea')}
              </button>
            </div>
          )}

          {/* "Clear area filter" small chip - appears when bounds filter is active */}
          {appliedBounds && (
            <div className="absolute top-3 right-3 z-[1000] pointer-events-auto">
              <button
                onClick={clearMapArea}
                className="bg-white border border-gray-200 hover:border-brand-blue text-gray-600 hover:text-brand-blue shadow-sm rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t('search.clearAreaFilter')}
              </button>
            </div>
          )}

          <Suspense fallback={<div className="w-full rounded-2xl bg-gray-100 animate-pulse" style={{ height: 'calc(100vh - 140px)' }} />}>
            <MapView
              listings={mapListings}
              loading={mapLoading}
              totalAll={mapTotal}
              onBoundsChange={setPendingBounds}
              freezeViewport={viewportFrozen}
            />
          </Suspense>
        </div>
      )}

      {/* ── GRID VIEW ── */}
      {viewMode === 'grid' && (
        <>
          {listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isSaved={user ? isSaved(l.id) : undefined}
                  onToggleSave={user ? () => toggleSave(l.id) : undefined}
                />
              ))}
            </div>
          ) : !loading ? (
            <div className="text-center py-16 text-gray-400 max-w-lg mx-auto">
              <svg className="w-14 h-14 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-lg font-semibold text-gray-600 mb-1">
                {/* Friendly apology + a recap of WHAT they searched for, so the
                    user knows we understood them.  Only reached when even the
                    fully-relaxed search found nothing (rare). */}
                {t('search.sorryNoMatch')}
              </p>
              {(() => {
                const bits: string[] = []
                if (rooms.length > 0) bits.push(`${rooms.join('/')} ${t('search.roomsShort', 'rm')}`)
                if (propertyType)     bits.push(propertyType)
                if (dealType === 'rent')    bits.push(t('search.forRent'))
                if (dealType === 'forsale') bits.push(t('search.forSale'))
                if (city)             bits.push(translateCity(city, i18n.language))
                if (priceMax)         bits.push(`≤ ₪${Number(priceMax).toLocaleString('he-IL')}`)
                return bits.length > 0
                  ? <p className="text-sm text-gray-400 mb-1">{bits.join(' · ')}</p>
                  : null
              })()}
              <p className="text-sm text-gray-400 mb-5">
                {t('search.noResultsHint', 'Try the suggestions below or adjust your filters.')}
              </p>

              {/* ── Smart suggestions: concrete one-click "try this" actions ── */}
              {(() => {
                const suggestions: { label: string; apply: () => void }[] = []

                // 1) Drop the most restrictive filter
                if (priceMax) {
                  const newMax = Math.round(parseInt(priceMax || '0') * 1.5)
                  suggestions.push({
                    label: `Raise max price to ₪${newMax.toLocaleString('he-IL')}`,
                    apply: () => setPriceMax(String(newMax)),
                  })
                }
                if (rooms.length === 1) {
                  const n = parseFloat(rooms[0])
                  const expanded = [Math.max(1, n - 0.5), n, n + 0.5, n + 1]
                    .filter(x => x > 0)
                    .map(x => x.toString())
                  suggestions.push({
                    label: `Try ${expanded.join('/')} rooms instead of ${rooms[0]}`,
                    apply: () => setRooms(expanded),
                  })
                }
                if (city && (priceMin || priceMax)) {
                  suggestions.push({
                    label: `Clear price range`,
                    apply: () => { setPriceMin(''); setPriceMax('') },
                  })
                }
                if (neighborhood) {
                  suggestions.push({
                    label: `Search anywhere in ${city || 'Israel'} (drop neighborhood)`,
                    apply: () => setNeighborhood(''),
                  })
                }
                // 2) Region anchor mapping - if user is on Tel Aviv with no
                //    luck, suggest the rest of Gush Dan etc.
                const REGION_ALTS: Record<string, string[]> = {
                  'תל אביב יפו': ['רמת גן', 'גבעתיים', 'פתח תקווה', 'חולון'],
                  'תל אביב':     ['רמת גן', 'גבעתיים', 'פתח תקווה', 'חולון'],
                  'ירושלים':     ['מודיעין', 'בית שמש', 'מעלה אדומים', 'אפרת'],
                  'חיפה':        ['קריית ביאליק', 'קריית מוצקין', 'נשר', 'נהריה'],
                  'הרצליה':      ['רעננה', 'כפר סבא', 'רמת השרון'],
                  'באר שבע':     ['אשקלון', 'אשדוד', 'דימונה'],
                }
                if (city && REGION_ALTS[city]) {
                  for (const alt of REGION_ALTS[city].slice(0, 3)) {
                    suggestions.push({
                      label: `Try ${alt} instead of ${city}`,
                      apply: () => setCity(alt),
                    })
                  }
                }
                if (city && !REGION_ALTS[city]) {
                  suggestions.push({
                    label: `Search anywhere (drop city)`,
                    apply: () => setCity(''),
                  })
                }

                if (suggestions.length === 0) return null
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-5">
                    <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide mb-3">
                      {t('search.suggestionsTitle', 'Maybe try...')}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestions.slice(0, 5).map((s, i) => (
                        <button
                          key={i}
                          onClick={s.apply}
                          className="px-3 py-1.5 bg-white border border-blue-200 hover:border-brand-blue hover:bg-brand-blue hover:text-white text-sm text-brand-blue font-medium rounded-full transition"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => {
                    setCity(''); setNeighborhood(''); setPropertyType('')
                    setPriceMin(''); setPriceMax(''); setRooms([])
                    setSizeMin(''); setSizeMax(''); setCondition('')
                    setDealType(''); setFeatures(emptyFeatures())
                    setKeyword(''); setFloorMin(''); setFloorMax(''); setPostedWithin(''); setSource('')
                  }}
                  className="px-4 py-2 bg-brand-blue text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition"
                >
                  {t('search.clearFilters')}
                </button>
                {city && (
                  <button
                    onClick={() => setCity('')}
                    className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
                  >
                    {t('search.removeCity')}
                  </button>
                )}
              </div>
              {/* Quick city suggestions */}
              <div className="mt-6">
                <p className="text-xs text-gray-400 mb-2">{t('search.tryCity')}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['תל אביב יפו', 'ירושלים', 'חיפה', 'ראשון לציון', 'נתניה'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCity(c)}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-full transition"
                    >
                      {translateCity(c, i18n.language)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="bg-gray-200 h-48" />
                  <div className="p-4 space-y-3">
                    <div className="bg-gray-200 h-5 w-1/2 rounded" />
                    <div className="bg-gray-200 h-4 w-3/4 rounded" />
                    <div className="bg-gray-200 h-3 w-full rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-10">
              <button onClick={() => goToPage(page - 1)} disabled={page === 1}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {pageNumbers().map((n, i) =>
                n === '...'
                  ? <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-gray-400 text-sm">...</span>
                  : <button key={n} onClick={() => goToPage(n as number)}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition ${
                        page === n ? 'bg-brand-blue text-white shadow-sm' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>{n}</button>
              )}

              <button onClick={() => goToPage(page + 1)} disabled={page === totalPages}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
