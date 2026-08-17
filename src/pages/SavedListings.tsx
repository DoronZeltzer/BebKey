import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types/listing'
import { useSeo } from '../hooks/useSeo'
import { useSavedListings } from '../hooks/useSavedListings'
import { useAuth } from '../context/AuthContext'

export default function SavedListings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { savedIds, isSaved, toggleSave } = useSavedListings()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useSeo({ title: 'Saved Listings | BebKey' })

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  // Fetch full listing objects whenever savedIds changes
  useEffect(() => {
    if (!user) return

    const ids = Array.from(savedIds)

    if (ids.length === 0) {
      setListings([])
      setLoading(false)
      return
    }

    setLoading(true)
    supabase
      .from('listings')
      .select(
        'id,source,price,city,street,neighborhood,size_m2,rooms,floor,property_type,deal_type,' +
        'lat,lng,description,images,is_active,source_url,scraped_at,created_at,quality_score,has_image'
      )
      .in('id', ids)
      .then(({ data }) => {
        setListings((data ?? []) as unknown as Listing[])
        setLoading(false)
      })
  }, [savedIds, user])

  if (!user) return null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('saved.title')}</h1>

      {/* Loading skeleton */}
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

      {/* Empty state */}
      {!loading && listings.length === 0 && (
        <div className="text-center py-20 text-gray-400 max-w-md mx-auto">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <p className="text-lg font-semibold text-gray-600 mb-2">{t('saved.empty')}</p>
          <p className="text-sm text-gray-400 mb-6">{t('saved.emptyHint')}</p>
          <Link
            to="/search"
            className="inline-block px-6 py-2.5 bg-brand-blue text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm"
          >
            {t('saved.browseCTA')}
          </Link>
        </div>
      )}

      {/* Listings grid */}
      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((l) => (
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
  )
}
