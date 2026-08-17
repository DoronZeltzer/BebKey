import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Listing } from '../types/listing'

interface AgentStats {
  activeListings: number
  totalClients: number
  unreadNotifications: number
  matchesThisWeek: number
}

interface AgentData {
  agentId: string | null
  stats: AgentStats
  myListings: Listing[]
  loading: boolean
  ensureAgent: () => Promise<string | null>
  refreshStats: () => void
}

const EMPTY_STATS: AgentStats = {
  activeListings: 0,
  totalClients: 0,
  unreadNotifications: 0,
  matchesThisWeek: 0,
}

export function useAgentData(): AgentData {
  const { user } = useAuth()
  const [agentId, setAgentId] = useState<string | null>(null)
  const [stats, setStats] = useState<AgentStats>(EMPTY_STATS)
  const [myListings, setMyListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refreshStats = useCallback(() => setTick(t => t + 1), [])

  // Auto-create agent row if missing, return agentId
  const ensureAgent = useCallback(async (): Promise<string | null> => {
    if (!user) return null
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing?.id) { setAgentId(existing.id); return existing.id }

    const { data: created } = await supabase
      .from('agents')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (created?.id) { setAgentId(created.id); return created.id }
    return null
  }, [user])

  useEffect(() => {
    if (!user) { setLoading(false); return }

    async function load() {
      setLoading(true)

      // 1. My manually posted listings (include locked so owner can see and restore them)
      const { data: listings, count: listingCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact' })
        .eq('posted_by_user_id', user!.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20)

      // Also fetch locked listings so the dashboard can show them with a resubscribe prompt
      const { data: lockedListings } = await supabase
        .from('listings')
        .select('*')
        .eq('posted_by_user_id', user!.id)
        .eq('is_locked', true)
        .order('created_at', { ascending: false })

      const allMyListings = [
        ...(listings ?? []),
        ...(lockedListings ?? []).filter(l => !listings?.find(a => a.id === l.id)),
      ]

      setMyListings(allMyListings as Listing[])

      // 2. Agent record
      const { data: agentRow } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()

      const aid = agentRow?.id ?? null
      setAgentId(aid)

      let clientCount = 0
      let unread = 0
      let weekMatches = 0

      if (aid) {
        const { count: cc } = await supabase
          .from('agent_clients')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', aid)
          .eq('is_active', true)
        clientCount = cc ?? 0

        const { count: uc } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', aid)
          .eq('is_read', false)
        unread = uc ?? 0

        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const { count: wc } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', aid)
          .gte('sent_at', weekAgo.toISOString())
        weekMatches = wc ?? 0
      }

      setStats({
        activeListings: listingCount ?? 0,
        totalClients: clientCount,
        unreadNotifications: unread,
        matchesThisWeek: weekMatches,
      })

      setLoading(false)
    }

    load()
  }, [user, tick])

  return { agentId, stats, myListings, loading, ensureAgent, refreshStats }
}
