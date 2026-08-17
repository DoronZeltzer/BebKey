import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { trackEvent } from '../components/GoogleAnalytics'

export function useSavedListings() {
  const { user } = useAuth()
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) { setSavedIds(new Set()); return }
    supabase
      .from('saved_listings')
      .select('listing_id')
      .then(({ data }) => {
        setSavedIds(new Set((data ?? []).map((r: { listing_id: string }) => r.listing_id)))
      })
  }, [user])

  const isSaved = useCallback((listingId: string) => savedIds.has(listingId), [savedIds])

  const toggleSave = useCallback(async (listingId: string) => {
    if (!user) return
    if (savedIds.has(listingId)) {
      await supabase.from('saved_listings').delete().eq('listing_id', listingId).eq('user_id', user.id)
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      const { error } = await supabase.from('saved_listings').insert({ user_id: user.id, listing_id: listingId })
      if (!error) {
        setSavedIds(prev => new Set([...prev, listingId]))
        // GA4 conversion - "save" is a meaningful intent signal for buyers
        trackEvent('add_to_wishlist', { item_id: listingId })
      }
    }
  }, [user, savedIds])

  return { savedIds, isSaved, toggleSave }
}
