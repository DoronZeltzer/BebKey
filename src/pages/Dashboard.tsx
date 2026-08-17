import { useState, useEffect, lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useAgentData } from '../hooks/useAgentData'
import { buildAddress, CITY_TRANSLATIONS } from '../lib/cityNames'
import { supabase } from '../lib/supabase'
import { useSavedListings } from '../hooks/useSavedListings'
import { getUserSubscription, isSubscriptionActive, type UserSubscription } from '../lib/subscriptions'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'
import { useSeo } from '../hooks/useSeo'
import BoostModal from '../components/BoostModal'
import { BOOSTS, boostGrowConfigured, type BoostType } from '../lib/boosts'
import { acceptOfficeInvites } from '../lib/offices'

// ClientForm + ExcelImport are heavy (ExcelImport pulls in ~600KB of xlsx)
// and are only rendered when the user opens a modal - lazy-load them.
const ClientForm  = lazy(() => import('../components/ClientForm'))
const ExcelImport = lazy(() => import('../components/ExcelImport'))

type Tab = 'overview' | 'listings' | 'searches' | 'clients' | 'notifications' | 'saved' | 'inquiries'

interface Inquiry {
  id: string
  created_at: string
  listing_id: string | null
  buyer_name: string
  buyer_phone: string
  buyer_email: string | null
  message: string | null
  status: 'new' | 'read' | 'replied'
  agent_notes: string | null
  listing?: { id: string; city: string | null; price: number | null; images: string[] } | null
}

interface Notification {
  id: string
  listing_id: string
  client_id: string
  is_read: boolean
  sent_at: string
  listing?: {
    id: string
    city: string | null
    price: number | null
    rooms: number | null
    property_type: string | null
    images: string[]
  }
  client?: { client_name: string }
}

interface SavedSearch {
  id: string
  name: string | null
  city: string | null
  price_min: number | null
  price_max: number | null
  rooms_min: number | null
  property_type: string | null
  deal_type: string | null
  notify_email: string | null
  created_at: string
}

function formatPrice(price: number | null): string {
  if (!price) return '-'
  if (price < 50000) return `₪${price.toLocaleString('he-IL')} /mo`
  return `₪${price.toLocaleString('he-IL')}`
}

export default function Dashboard() {
  useSeo({
    title: 'Dashboard',
    description: 'Your BebKey dashboard - manage clients, listings, and search alerts.',
  })
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { agentId, stats, myListings, loading, ensureAgent, refreshStats } = useAgentData()
  const [boostFor, setBoostFor] = useState<string | null>(null)
  const [boostNote, setBoostNote] = useState('')
  const { savedIds, isSaved, toggleSave } = useSavedListings()
  const [tab, setTab] = useState<Tab>('overview')

  // ── Saved listings ────────────────────────────────────────────────────────
  const [savedListings, setSavedListings] = useState<Listing[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)

  useEffect(() => {
    if (tab !== 'saved' || savedIds.size === 0) {
      if (tab === 'saved') setSavedListings([])
      return
    }
    setLoadingSaved(true)
    supabase
      .from('listings')
      .select('*')
      .in('id', [...savedIds])
      .then(({ data }) => {
        setSavedListings((data ?? []) as Listing[])
        setLoadingSaved(false)
      })
  }, [tab, savedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(false)

  useEffect(() => {
    if (tab !== 'notifications' || !agentId) return
    setLoadingNotifs(true)
    supabase
      .from('notifications')
      .select(`
        id, listing_id, client_id, is_read, sent_at,
        listing:listings(id, city, price, rooms, property_type, images),
        client:agent_clients(client_name)
      `)
      .eq('agent_id', agentId)
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setNotifications((data ?? []) as unknown as Notification[])
        setLoadingNotifs(false)
      })
  }, [tab, agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markAllRead() {
    if (!agentId) return
    await supabase.from('notifications').update({ is_read: true }).eq('agent_id', agentId).eq('is_read', false)
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
    refreshStats()
  }

  async function markOneRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n))
    refreshStats()
  }

  // ── Subscription ─────────────────────────────────────────────────────────
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  useEffect(() => {
    if (!user) return
    getUserSubscription(user.id).then(setSubscription)
    // Activate any pending office team invites addressed to this user (invited → active).
    acceptOfficeInvites(user.id, user.email)
  }, [user])

  const role = (user?.user_metadata?.role as string | undefined) ?? 'buyer'
  const email = user?.email ?? ''
  const initial = email.charAt(0).toUpperCase()
  const isAgent = role === 'agent'
  const subActive = subscription ? isSubscriptionActive(subscription.status) : null // null = still loading

  const roleLabel =
    role === 'agent'  ? t('auth.roleAgent') :
    role === 'seller' ? t('auth.roleSeller') :
                        t('auth.roleBuyer')

  // ── Saved searches ────────────────────────────────────────────────────────
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [loadingSearches, setLoadingSearches] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoadingSearches(true)
    supabase
      .from('filters')
      .select('id,name,city,price_min,price_max,rooms_min,property_type,deal_type,notify_email,created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSavedSearches((data ?? []) as SavedSearch[])
        setLoadingSearches(false)
      })
  }, [user])

  async function toggleSearchAlerts(id: string, currentEmail: string | null) {
    const newEmail = currentEmail ? null : (user?.email ?? null)
    await supabase.from('filters').update({ notify_email: newEmail }).eq('id', id)
    setSavedSearches((ss) => ss.map((s) => s.id === id ? { ...s, notify_email: newEmail } : s))
  }

  async function deleteSavedSearch(id: string) {
    await supabase.from('filters').update({ is_active: false }).eq('id', id)
    setSavedSearches((ss) => ss.filter((s) => s.id !== id))
  }

  function savedSearchToUrl(s: SavedSearch) {
    const p = new URLSearchParams()
    if (s.city) p.set('city', s.city)
    if (s.price_min) p.set('priceMin', String(s.price_min))
    if (s.price_max) p.set('priceMax', String(s.price_max))
    if (s.rooms_min) p.set('rooms', String(s.rooms_min))
    if (s.property_type) p.set('propertyType', s.property_type)
    return `/search?${p.toString()}`
  }

  // ── Clients ──────────────────────────────────────────────────────────────
  interface AgentClient {
    id: string
    client_name: string
    phone: string | null
    budget_min: number | null
    budget_max: number | null
    preferred_cities: string[] | null
    min_rooms: number | null
    max_rooms: number | null
    min_size_m2: number | null
    property_types: string[] | null
    notes: string | null
    is_active: boolean
    created_at: string
  }

  const [clients, setClients] = useState<AgentClient[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [showClientForm, setShowClientForm] = useState(false)
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [editingClient, setEditingClient] = useState<AgentClient | null>(null)

  async function fetchClients(aid: string) {
    setClientsLoading(true)
    const { data } = await supabase
      .from('agent_clients')
      .select('*')
      .eq('agent_id', aid)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setClients((data ?? []) as AgentClient[])
    setClientsLoading(false)
  }

  useEffect(() => {
    if (tab === 'clients' && agentId) fetchClients(agentId)
  }, [tab, agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddClientClick() {
    setEditingClient(null)
    const aid = agentId ?? await ensureAgent()
    if (!aid) return
    setShowClientForm(true)
  }

  async function handleExcelClick() {
    const aid = agentId ?? await ensureAgent()
    if (!aid) return
    setShowExcelImport(true)
  }

  async function deactivateClient(id: string) {
    await supabase.from('agent_clients').update({ is_active: false }).eq('id', id)
    setClients(cs => cs.filter(c => c.id !== id))
    refreshStats()
  }

  // ── Inquiries ─────────────────────────────────────────────────────────────
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loadingInquiries, setLoadingInquiries] = useState(false)

  useEffect(() => {
    if (tab !== 'inquiries' || !user) return
    setLoadingInquiries(true)
    supabase
      .from('inquiries')
      .select('id,created_at,listing_id,buyer_name,buyer_phone,buyer_email,message,status,agent_notes,listing:listings(id,city,price,images)')
      .eq('agent_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setInquiries((data ?? []) as unknown as Inquiry[])
        setLoadingInquiries(false)
      })
  }, [tab, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markInquiryRead(id: string, status: 'read' | 'replied') {
    await supabase.from('inquiries').update({ status }).eq('id', id)
    setInquiries(qs => qs.map(q => q.id === id ? { ...q, status } : q))
  }

  // CRM: set inquiry status (UI labels New / Contacted / Closed → stored as new / read / replied)
  async function setInquiryStatus(id: string, status: Inquiry['status']) {
    setInquiries(qs => qs.map(q => q.id === id ? { ...q, status } : q))
    await supabase.from('inquiries').update({ status }).eq('id', id)
  }

  // CRM: persist agent notes (saved on blur)
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null)
  async function saveInquiryNotes(id: string, value: string) {
    await supabase.from('inquiries').update({ agent_notes: value }).eq('id', id)
    setInquiries(qs => qs.map(q => q.id === id ? { ...q, agent_notes: value } : q))
    setSavedNoteId(id)
    setTimeout(() => setSavedNoteId(prev => (prev === id ? null : prev)), 1500)
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview',      label: t('dashboard.overview'),       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { key: 'listings',      label: t('dashboard.listings'),       icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { key: 'searches',      label: t('dashboard.savedSearches'),  icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
    { key: 'clients',       label: t('dashboard.clients'),        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { key: 'notifications', label: t('dashboard.notifications'),  icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { key: 'saved',         label: t('dashboard.savedProperties'), icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
    { key: 'inquiries',    label: t('dashboard.inquiries'),       icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex gap-8">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col gap-1 w-52 flex-shrink-0">
          {/* Profile */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 bg-brand-blue rounded-full flex items-center justify-center text-white text-xl font-bold">
              {initial}
            </div>
            <p className="text-sm font-semibold text-gray-800 truncate w-full">{email}</p>
            <span className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full">
              {roleLabel}
            </span>
            {isAgent && subscription !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                subActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {subActive
                  ? `${subscription.plan ?? 'Active'} plan`
                  : subscription.status === 'trialing'
                  ? 'Trial'
                  : 'No plan'}
              </span>
            )}
          </div>

          {/* Nav tabs */}
          <nav className="flex flex-col gap-1">
            {TABS.map((tab_item) => (
              <button
                key={tab_item.key}
                onClick={() => setTab(tab_item.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-start w-full ${
                  tab === tab_item.key
                    ? 'bg-brand-blue text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab_item.icon} />
                </svg>
                {tab_item.label}
                {tab_item.key === 'notifications' && stats.unreadNotifications > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {stats.unreadNotifications}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="mt-auto pt-4 flex flex-col gap-2">
            <Link
              to="/submit"
              className="flex items-center justify-center gap-2 px-3 py-2 bg-brand-orange text-gray-900 rounded-xl text-sm font-semibold hover:bg-orange-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('dashboard.postListing')}
            </Link>
            <button
              onClick={() => signOut().then(() => navigate('/'))}
              className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors py-1"
            >
              {t('nav.logout')}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">

          {/* ── Subscription upgrade banner (agents without active plan) ── */}
          {isAgent && subscription !== null && !subActive && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">
                  {subscription?.status === 'canceled'
                    ? '⚠️ Your subscription has ended'
                    : '🔒 No active subscription'}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {subscription?.status === 'canceled'
                    ? 'Your listings are locked. Resubscribe to make them visible again.'
                    : 'Subscribe to unlock agent features: post listings, client matching alerts, and more.'}
                </p>
              </div>
              <Link
                to="/pricing"
                className="px-4 py-2 bg-brand-orange text-gray-900 text-sm font-semibold rounded-xl hover:bg-orange-500 transition-colors whitespace-nowrap"
              >
                View plans →
              </Link>
            </div>
          )}


          {/* Mobile tab selector */}
          <div className="md:hidden flex gap-2 mb-6 overflow-x-auto pb-1">
            {TABS.map((tab_item) => (
              <button
                key={tab_item.key}
                onClick={() => setTab(tab_item.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === tab_item.key
                    ? 'bg-brand-blue text-white'
                    : 'bg-white border border-gray-200 text-gray-600'
                }`}
              >
                {tab_item.label}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-6">
              <h1 className="text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>

              {/* Stats grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-gray-200 rounded-2xl h-24 animate-pulse" />
                  ))
                ) : [
                  { label: t('dashboard.activeListings'),      value: stats.activeListings },
                  { label: t('dashboard.totalClients'),        value: stats.totalClients },
                  { label: t('dashboard.matchesThisWeek'),     value: stats.matchesThisWeek },
                  { label: t('dashboard.unreadNotifications'), value: stats.unreadNotifications, highlight: stats.unreadNotifications > 0 },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`bg-white rounded-2xl shadow-sm border p-5 text-center ${
                      stat.highlight ? 'border-red-200' : 'border-gray-100'
                    }`}
                  >
                    <p className={`text-3xl font-bold ${stat.highlight ? 'text-red-500' : 'text-brand-blue'}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="grid md:grid-cols-3 gap-4">
                <Link to="/search" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow group">
                  <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-800">{t('nav.search')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('dashboard.browseListings')}</p>
                </Link>

                <Link to="/submit" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-800">{t('dashboard.postListing')}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('dashboard.addProperty')}</p>
                </Link>

                <Link to="/pricing" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-800">{t('nav.pricing')}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {isAgent ? t('dashboard.upgradePlan') : t('dashboard.viewPlans')}
                  </p>
                </Link>
              </div>

              {/* Recent listings preview */}
              {myListings.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-800">{t('dashboard.myRecentListings')}</h2>
                    <button onClick={() => setTab('listings')} className="text-sm text-brand-blue hover:underline">
                      {t('dashboard.viewAll')}
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {myListings.slice(0, 4).map((l) => (
                      <Link
                        key={l.id}
                        to={`/listing/${l.id}`}
                        className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow flex gap-3"
                      >
                        {l.images?.[0] ? (
                          <img src={l.images[0]} alt="" referrerPolicy="no-referrer" className="w-16 h-14 object-cover rounded-lg flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-14 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                            </svg>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-brand-blue text-sm">{formatPrice(l.price)}</p>
                          <p className="text-xs text-gray-600 truncate">{buildAddress(l.street, l.neighborhood, l.city, i18n.language)}</p>
                          {l.rooms && <p className="text-xs text-gray-400 mt-0.5">{l.rooms} {t('dashboard.rooms')}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MY LISTINGS ── */}
          {tab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.listings')}</h2>
                <div className="flex items-center gap-3">
                  <Link to="/office-manage" className="text-sm text-brand-blue font-medium hover:underline whitespace-nowrap">
                    {t('dashboard.manageOffice', 'Manage office')} →
                  </Link>
                  <Link to="/submit" className="flex items-center gap-1.5 px-4 py-2 bg-brand-orange text-gray-900 rounded-lg text-sm font-semibold hover:bg-orange-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('dashboard.postListing')}
                  </Link>
                </div>
              </div>

              {/* Bulk boost */}
              {!loading && myListings.length > 0 && (
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={() => {
                      setBoostFor('ALL')
                      setBoostNote(t('dashboard.boostAllNote', { count: myListings.length }))
                    }}
                    className="flex items-center gap-1.5 text-sm font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-2 rounded-lg transition"
                  >
                    ⚡ {t('dashboard.boostAll', 'Boost all listings')}
                  </button>
                </div>
              )}

              {/* Locked listings banner */}
              {!loading && myListings.some(l => l.is_locked) && (
                <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">{t('dashboard.hiddenListings')}</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {t('dashboard.hiddenListingsDesc')}
                    </p>
                  </div>
                  <Link
                    to="/pricing"
                    className="flex-shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    {t('dashboard.resubscribe')}
                  </Link>
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse" />
                  ))}
                </div>
              ) : myListings.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                  </svg>
                  <p className="text-gray-500 mb-4">{t('dashboard.noListings')}</p>
                  <Link to="/submit" className="inline-block px-6 py-2.5 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                    {t('dashboard.postFirstListing')}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {myListings.map((l) => (
                    <div
                      key={l.id}
                      className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${
                        l.is_locked ? 'border-amber-200 opacity-75' : 'border-gray-100'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {l.images?.[0] ? (
                          <img src={l.images[0]} alt="" referrerPolicy="no-referrer" className="w-20 h-16 object-cover rounded-lg" />
                        ) : (
                          <div className="w-20 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                            <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                            </svg>
                          </div>
                        )}
                        {l.is_locked && (
                          <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-brand-blue">{formatPrice(l.price)}</p>
                          {l.is_locked && (
                            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                              {t('dashboard.hidden')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{buildAddress(l.street, l.neighborhood, l.city, i18n.language)}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                          {l.rooms != null && <span>{l.rooms} {t('dashboard.rooms')}</span>}
                          {l.size_m2 != null && <span>{l.size_m2} m²</span>}
                          {l.property_type && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                              {l.property_type}
                            </span>
                          )}
                          {((l as unknown as Record<string, number>).view_count ?? 0) > 0 && (
                            <span className="flex items-center gap-1 ms-auto">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              {(l as unknown as Record<string, number>).view_count}
                            </span>
                          )}
                        </div>
                      </div>
                      {l.is_locked ? (
                        <Link
                          to="/pricing"
                          className="text-xs text-amber-600 font-semibold hover:underline flex-shrink-0"
                        >
                          {t('dashboard.resubscribe')}
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              setBoostFor(l.id)
                              setBoostNote(t('dashboard.boostSingleNote'))
                            }}
                            className="text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 px-2.5 py-1 rounded-full"
                          >
                            ⚡ {t('dashboard.boost', 'Boost')}
                          </button>
                          <Link to={`/listing/${l.id}`} className="text-sm text-brand-blue hover:underline">
                            View →
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {boostFor && (
            <BoostModal
              onClose={() => setBoostFor(null)}
              note={boostNote}
              onBuy={async (type: BoostType) => {
                const b = BOOSTS[type]
                // Bulk boost + not-yet-configured boost pages fall back to a note.
                if (boostFor === 'ALL' || !boostGrowConfigured(type)) {
                  setBoostNote(t('dashboard.boostPickedNote', {
                    name:  i18n.language === 'he' ? b.nameHe : b.nameEn,
                    price: b.price,
                  }))
                  return
                }
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) { navigate('/login'); return }
                const res = await fetch('/api/grow-checkout', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type':  'application/json',
                  },
                  body: JSON.stringify({ kind: 'boost', listingId: boostFor, boostType: type }),
                })
                const body = await res.json().catch(() => ({}))
                if (!res.ok || !body?.url) {
                  setBoostNote(body?.error || 'Could not start checkout. Please try again.')
                  return
                }
                window.location.href = body.url
              }}
            />
          )}

          {/* ── SAVED SEARCHES ── */}
          {tab === 'searches' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.savedSearches')}</h2>
                <Link to="/search" className="text-sm text-brand-blue hover:underline">
                  {t('dashboard.newSearch')}
                </Link>
              </div>

              {loadingSearches ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="bg-gray-200 h-16 rounded-xl animate-pulse" />)}
                </div>
              ) : savedSearches.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-gray-500 mb-4">{t('dashboard.noSavedSearches')}</p>
                  <Link to="/search" className="inline-block px-5 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
                    {t('dashboard.searchListings')}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {savedSearches.map((s) => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                      <div className="w-9 h-9 bg-brand-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{s.name ?? t('dashboard.savedSearch')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(s.created_at).toLocaleDateString()}
                          {s.notify_email && (
                            <span className="ml-2 text-green-500">● {t('dashboard.alertsOn') || 'Alerts on'}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Email alert toggle */}
                        <button
                          onClick={() => toggleSearchAlerts(s.id, s.notify_email)}
                          title={s.notify_email ? (t('dashboard.disableAlerts') || 'Disable email alerts') : (t('dashboard.enableAlerts') || 'Enable email alerts')}
                          className={`p-1.5 rounded-lg border text-xs transition ${
                            s.notify_email
                              ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                              : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d={s.notify_email
                                ? "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                : "M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 17.25c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm4.875 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75z"}
                            />
                          </svg>
                        </button>
                        <Link
                          to={savedSearchToUrl(s)}
                          className="px-3 py-1.5 bg-brand-blue text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition"
                        >
                          {t('dashboard.openSearch')}
                        </Link>
                        <button
                          onClick={() => deleteSavedSearch(s.id)}
                          className="px-3 py-1.5 border border-gray-200 text-red-400 rounded-lg text-xs hover:bg-red-50 transition"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CLIENTS ── */}
          {tab === 'clients' && (
            <div>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.clients')}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleExcelClick}
                    className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('dashboard.importExcel')}
                  </button>
                  <button
                    onClick={handleAddClientClick}
                    className="flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('dashboard.addClient')}
                  </button>
                </div>
              </div>

              {clientsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="bg-gray-200 h-20 rounded-xl animate-pulse" />)}
                </div>
              ) : clients.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-gray-500 mb-4">{t('dashboard.noClients')}</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={handleAddClientClick} className="px-5 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
                      {t('dashboard.addFirstClient')}
                    </button>
                    <button onClick={handleExcelClick} className="px-5 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                      {t('dashboard.importFromExcel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {clients.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0 text-brand-blue font-bold text-sm">
                            {c.client_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800">{c.client_name}</p>
                            {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => { setEditingClient(c); setShowClientForm(true) }}
                            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                          >
                            {t('dashboard.edit')}
                          </button>
                          <button
                            onClick={() => deactivateClient(c.id)}
                            className="text-xs px-2.5 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 transition"
                          >
                            {t('dashboard.remove')}
                          </button>
                        </div>
                      </div>

                      {/* Criteria chips */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(c.budget_min || c.budget_max) && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            ₪{(c.budget_min ?? 0).toLocaleString()} - {c.budget_max ? `₪${c.budget_max.toLocaleString()}` : '∞'}
                          </span>
                        )}
                        {c.min_rooms && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {c.min_rooms}+ {t('dashboard.rooms')}
                          </span>
                        )}
                        {c.min_size_m2 && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {c.min_size_m2}+ m²
                          </span>
                        )}
                        {(c.preferred_cities ?? []).map(city => (
                          <span key={city} className="text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full">
                            {CITY_TRANSLATIONS[city]?.en ?? city}
                          </span>
                        ))}
                        {(c.property_types ?? []).map(pt => (
                          <span key={pt} className="text-xs bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded-full">
                            {t(`listing.propertyTypes.${pt}`, pt)}
                          </span>
                        ))}
                      </div>
                      {c.notes && <p className="text-xs text-gray-400 mt-2 italic">"{c.notes}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SAVED PROPERTIES ── */}
          {tab === 'saved' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.savedProperties')}</h2>
                <Link to="/search" className="text-sm text-brand-blue hover:underline">
                  {t('dashboard.browseMore')}
                </Link>
              </div>

              {loadingSaved ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <div key={i} className="bg-gray-200 rounded-2xl h-64 animate-pulse" />)}
                </div>
              ) : savedListings.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-gray-500 mb-4">{t('dashboard.noSavedProperties')}</p>
                  <Link to="/search" className="inline-block px-5 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
                    {t('dashboard.browseListingsBtn')}
                  </Link>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedListings.map(l => (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      isSaved={isSaved(l.id)}
                      onToggleSave={() => toggleSave(l.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === 'notifications' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.notifications')}</h2>
                {notifications.some(n => !n.is_read) && (
                  <button
                    onClick={markAllRead}
                    className="text-sm text-brand-blue hover:underline"
                  >
                    {t('dashboard.markAllRead')}
                  </button>
                )}
              </div>

              {loadingNotifs ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="bg-gray-200 h-20 rounded-xl animate-pulse" />)}
                </div>
              ) : notifications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-gray-500 mb-1">{t('dashboard.noNotifications')}</p>
                  <p className="text-xs text-gray-400">{t('dashboard.noNotificationsDesc')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {notifications.map(n => (
                    <Link
                      key={n.id}
                      to={n.listing_id ? `/listing/${n.listing_id}` : '#'}
                      onClick={() => { if (!n.is_read) markOneRead(n.id) }}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors hover:bg-gray-50 ${
                        n.is_read ? 'bg-white border-gray-100' : 'bg-brand-blue/5 border-brand-blue/20'
                      }`}
                    >
                      {/* Listing thumbnail */}
                      <div className="w-14 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {n.listing?.images?.[0] ? (
                          <img src={n.listing.images[0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {t('dashboard.newMatchFor')}{' '}
                          <span className="text-brand-blue">{n.client?.client_name ?? 'client'}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[
                            n.listing?.city,
                            n.listing?.price ? `₪${n.listing.price.toLocaleString('he-IL')}` : null,
                            n.listing?.rooms ? `${n.listing.rooms} ${t('dashboard.rooms')}` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(n.sent_at).toLocaleDateString('en-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!n.is_read && (
                        <div className="w-2.5 h-2.5 bg-brand-blue rounded-full flex-shrink-0" />
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── INQUIRIES ── */}
          {tab === 'inquiries' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">{t('dashboard.inquiries')}</h2>
                <span className="text-xs text-gray-400">
                  {inquiries.filter(q => q.status === 'new').length > 0
                    ? `${inquiries.filter(q => q.status === 'new').length} ${t('dashboard.newInquiries')}`
                    : t('dashboard.allRead')}
                </span>
              </div>

              {loadingInquiries ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="bg-gray-200 h-24 rounded-xl animate-pulse" />)}
                </div>
              ) : inquiries.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500">{t('dashboard.noInquiries')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('dashboard.noInquiriesDesc')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {inquiries.map(q => (
                    <div
                      key={q.id}
                      className={`bg-white rounded-2xl border p-4 transition-colors ${
                        q.status === 'new' ? 'border-brand-blue/30 bg-brand-blue/5' : 'border-gray-100'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Listing thumbnail */}
                        {q.listing && (
                          <Link to={`/listing/${q.listing.id}`} className="flex-shrink-0">
                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-gray-100">
                              {q.listing.images?.[0] ? (
                                <img src={q.listing.images[0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </Link>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 text-sm">{q.buyer_name}</span>
                            {q.status === 'new' && (
                              <span className="bg-brand-orange text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">New</span>
                            )}
                            {q.listing?.city && (
                              <span className="text-xs text-gray-400">· {q.listing.city}</span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto">
                              {new Date(q.created_at).toLocaleDateString('en-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <a href={`tel:${q.buyer_phone}`} className="flex items-center gap-1 hover:text-brand-blue transition">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {q.buyer_phone}
                            </a>
                            {q.buyer_email && (
                              <a href={`mailto:${q.buyer_email}`} className="flex items-center gap-1 hover:text-brand-blue transition truncate">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {q.buyer_email}
                              </a>
                            )}
                          </div>

                          {q.message && (
                            <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2 italic">
                              "{q.message}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <a
                          href={`https://wa.me/972${q.buyer_phone.replace(/\D/g, '').replace(/^0/, '')}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-center py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition"
                        >
                          WhatsApp
                        </a>
                        <a
                          href={`tel:${q.buyer_phone}`}
                          className="flex-1 text-center py-1.5 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
                        >
                          {t('listing.contact')}
                        </a>
                        {q.status !== 'replied' && (
                          <button
                            onClick={() => markInquiryRead(q.id, q.status === 'new' ? 'read' : 'replied')}
                            className="flex-1 text-center py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition"
                          >
                            {q.status === 'new' ? t('dashboard.markRead') : t('dashboard.markReplied')}
                          </button>
                        )}
                      </div>

                      {/* CRM: status + notes */}
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400 me-1">{t('dashboard.leadStatus', 'Status')}</span>
                          {([
                            { label: t('dashboard.statusNew', 'New'),       value: 'new' as const },
                            { label: t('dashboard.statusContacted', 'Contacted'), value: 'read' as const },
                            { label: t('dashboard.statusClosed', 'Closed'),  value: 'replied' as const },
                          ]).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setInquiryStatus(q.id, opt.value)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${
                                q.status === opt.value
                                  ? 'bg-brand-blue text-white border-brand-blue'
                                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-gray-400">{t('dashboard.agentNotes', 'Private notes')}</label>
                            {savedNoteId === q.id && (
                              <span className="text-xs text-green-500">{t('dashboard.saved', 'Saved')}</span>
                            )}
                          </div>
                          <textarea
                            defaultValue={q.agent_notes ?? ''}
                            onBlur={(e) => {
                              if (e.target.value !== (q.agent_notes ?? '')) saveInquiryNotes(q.id, e.target.value)
                            }}
                            rows={2}
                            placeholder={t('dashboard.agentNotesPlaceholder', 'Add a private note about this lead…')}
                            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-brand-blue focus:border-brand-blue"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ── Modals (lazy-loaded) ── */}
      <Suspense fallback={null}>
      {showClientForm && (agentId ?? true) && (
        <ClientForm
          agentId={agentId!}
          editId={editingClient?.id}
          initial={editingClient ? {
            client_name: editingClient.client_name,
            phone: editingClient.phone ?? '',
            budget_min: editingClient.budget_min?.toString() ?? '',
            budget_max: editingClient.budget_max?.toString() ?? '',
            preferred_cities: editingClient.preferred_cities ?? [],
            min_rooms: editingClient.min_rooms?.toString() ?? '',
            max_rooms: editingClient.max_rooms?.toString() ?? '',
            min_size_m2: editingClient.min_size_m2?.toString() ?? '',
            property_types: editingClient.property_types ?? [],
            notes: editingClient.notes ?? '',
          } : undefined}
          onClose={() => setShowClientForm(false)}
          onSaved={() => {
            setShowClientForm(false)
            if (agentId) fetchClients(agentId)
            refreshStats()
          }}
        />
      )}

      {showExcelImport && agentId && (
        <ExcelImport
          agentId={agentId}
          onClose={() => setShowExcelImport(false)}
          onImported={(count) => {
            setShowExcelImport(false)
            if (agentId) fetchClients(agentId)
            refreshStats()
            alert(`✅ ${count} clients imported successfully!`)
          }}
        />
      )}
      </Suspense>
    </div>
  )
}
