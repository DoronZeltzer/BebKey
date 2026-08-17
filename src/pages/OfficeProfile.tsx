/**
 * OfficeProfile - public profile page for a BebKey office (real-estate agency).
 *
 * URL: /office/:slug
 *
 * Renders the office's:
 *   - Logo (or a placeholder house icon) + name + city + phone + bio
 *   - Active listings linked to the office (listings.office_id)
 *   - "Our agents" — the active office_members
 *
 * Like AgentProfile, this is a shareable public surface: offices share
 * their own page on WhatsApp / FB → free distribution + backlinks.
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'
import { getOfficeBySlug, getOfficeMembers } from '../lib/offices'
import type { Office, OfficeMember } from '../lib/offices'

export default function OfficeProfile() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useTranslation()
  const [office, setOffice]     = useState<Office | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [members, setMembers]   = useState<OfficeMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const displayName = office?.name?.trim() || 'BebKey Office'

  useSeo({
    title: displayName,
    description:
      office?.bio?.slice(0, 160) ||
      `${displayName} on BebKey - view active listings, contact the agency, and explore properties${
        office?.city ? ` in ${office.city}` : ''
      }.`,
    url: `https://www.bebkey.com/office/${slug}`,
    image: office?.logo_url ?? undefined,
    type: 'article',
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    ;(async () => {
      const o = await getOfficeBySlug(slug)
      if (cancelled) return
      if (!o) { setNotFound(true); setLoading(false); return }
      setOffice(o)

      // Fetch the office's active listings
      const { data: ls } = await supabase
        .from('listings')
        .select('*')
        .eq('office_id', o.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60)
      if (!cancelled) setListings((ls ?? []) as Listing[])

      // Fetch the office's members (we only surface active ones)
      const ms = await getOfficeMembers(o.id)
      if (!cancelled) setMembers(ms.filter(m => m.status === 'active'))

      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 animate-pulse">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gray-200" />
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

  if (notFound || !office) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">🏠</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {t('office.notFound') || 'Office not found'}
        </h1>
        <p className="text-gray-500 mb-6">
          {t('office.notFoundHint') || 'This office may have removed their profile or it never existed.'}
        </p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
        >
          {t('office.backHome') || 'Back to home'}
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-brand-blue/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
            {office.logo_url ? (
              <img
                src={office.logo_url}
                alt={`${displayName} logo`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <svg className="w-10 h-10 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
              </svg>
            )}
          </div>
          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-800 break-words">
              {displayName}
            </h1>
            <div className="flex items-center gap-3 flex-wrap text-sm text-gray-500 mt-1">
              {office.city && (
                <span className="inline-flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {office.city}
                </span>
              )}
              {office.phone && (
                <a
                  href={`tel:${office.phone}`}
                  className="inline-flex items-center gap-1 text-brand-blue font-semibold hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {office.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {office.bio && (
          <p className="mt-6 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
            {office.bio}
          </p>
        )}
      </div>

      {/* Listings */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">
          {t('office.listingsHeading') || 'Listings'}
        </h2>
        <span className="text-sm text-gray-500">
          {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
        </span>
      </div>
      {listings.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-500">
          {t('office.noListings') || 'This office has no active listings right now. Check back soon.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      {/* Our agents */}
      {members.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {t('office.agentsHeading') || 'Our agents'}
          </h2>
          <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {members.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex-shrink-0 flex items-center justify-center text-brand-blue text-sm font-bold">
                  {m.email.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700 break-all">{m.email}</span>
                {m.role === 'owner' && (
                  <span className="ml-auto bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full">
                    {t('office.ownerBadge') || 'Owner'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
