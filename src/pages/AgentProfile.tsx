/**
 * AgentProfile - public profile page for a BebKey agent.
 *
 * URL: /agent/:agentId
 *
 * Renders the agent's:
 *   - Display name (from agency_name) + verified badge if the linked
 *     user is on a paid plan
 *   - Bio
 *   - Active listings posted by them
 *   - "Get in touch" CTA → opens a contact-form prefill (we do NOT
 *     expose the raw phone or email to bots - visitors message the
 *     agent through BebKey's contact form which is rate-limited and
 *     honeypot-protected)
 *
 * Why this page matters:
 *   Agents share their own page on WhatsApp / FB → free distribution.
 *   Every share is a backlink + a new visitor for BebKey.  This is the
 *   highest-leverage growth surface we have without paying for ads.
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'

interface Agent {
  id:           string
  user_id:      string
  agency_name:  string | null
  phone:        string | null
  bio:          string | null
  logo_url:     string | null
}

interface AgentUser {
  email:        string
  plan:         string
  role:         string
}

export default function AgentProfile() {
  const { agentId = '' } = useParams<{ agentId: string }>()
  const { t } = useTranslation()
  const [agent, setAgent]       = useState<Agent | null>(null)
  const [user, setUser]         = useState<AgentUser | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const displayName =
    agent?.agency_name?.trim() ||
    user?.email?.split('@')[0] ||
    t('agent.unnamed') ||
    'BebKey Agent'

  useSeo({
    title: `${displayName} - ${t('agent.profilePageTitle') || 'Real Estate Agent'}`,
    description:
      agent?.bio?.slice(0, 160) ||
      `${displayName} on BebKey - view active listings, contact the agent, and explore properties.`,
    url: `https://www.bebkey.com/agent/${agentId}`,
    image: agent?.logo_url ?? undefined,
    type: 'article',
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: a, error: aErr } = await supabase
        .from('agents')
        .select('id,user_id,agency_name,phone,bio,logo_url')
        .eq('id', agentId)
        .maybeSingle()
      if (cancelled) return
      if (aErr || !a) { setNotFound(true); setLoading(false); return }
      setAgent(a as Agent)

      // Fetch the agent's user record for the plan + verified badge
      const { data: u } = await supabase
        .from('users')
        .select('email,plan,role')
        .eq('id', (a as Agent).user_id)
        .maybeSingle()
      if (!cancelled && u) setUser(u as AgentUser)

      // Fetch their active listings
      const { data: ls } = await supabase
        .from('listings')
        .select('*')
        .eq('posted_by_user_id', (a as Agent).user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60)
      if (!cancelled) setListings((ls ?? []) as Listing[])

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [agentId])

  // JSON-LD: RealEstateAgent
  useEffect(() => {
    if (!agent) return
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'RealEstateAgent',
      name:       displayName,
      url:        `https://www.bebkey.com/agent/${agentId}`,
      image:      agent.logo_url ?? undefined,
      description: agent.bio ?? undefined,
      worksFor:   { '@type': 'Organization', name: 'BebKey' },
      areaServed: { '@type': 'Country', name: 'Israel' },
    }
    let el = document.getElementById('agent-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'agent-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [agent, agentId, displayName])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 animate-pulse">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-20 h-20 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-72 bg-gray-200 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (notFound || !agent) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">🏠</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {t('agent.notFound') || 'Agent not found'}
        </h1>
        <p className="text-gray-500 mb-6">
          {t('agent.notFoundHint') || 'This agent may have removed their profile or it never existed.'}
        </p>
        <Link
          to="/search"
          className="inline-block px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
        >
          {t('agent.browseListings') || 'Browse listings'}
        </Link>
      </div>
    )
  }

  const isVerified = user?.plan && user.plan !== 'free'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-brand-blue/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
            {agent.logo_url ? (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img
                src={agent.logo_url}
                alt={`${displayName} logo`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-brand-blue text-2xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {/* Name + badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-800 break-words">
                {displayName}
              </h1>
              {isVerified && (
                <span
                  className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  title={t('agent.verifiedTitle') || 'Verified BebKey agent'}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                  {t('agent.verifiedBadge') || 'Verified'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {t('agent.subtitle', { count: listings.length }) ||
                `${listings.length} active ${listings.length === 1 ? 'listing' : 'listings'}`}
            </p>
          </div>
          {/* CTA - routes to contact form prefilled with the agent's user id */}
          <Link
            to={`/contact?category=general&agent=${agent.id}`}
            className="px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition w-full sm:w-auto text-center"
          >
            {t('agent.contactButton') || 'Contact agent'}
          </Link>
        </div>

        {/* Bio */}
        {agent.bio && (
          <p className="mt-6 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
            {agent.bio}
          </p>
        )}
      </div>

      {/* Listings */}
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        {t('agent.listingsHeading') || 'Active listings'}
      </h2>
      {listings.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-500">
          {t('agent.noListings') || 'This agent has no active listings right now. Check back soon.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  )
}
