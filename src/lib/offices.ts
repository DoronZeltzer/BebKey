/** Offices (agencies) — shared types + helpers for the Phase 2 office features. */
import { supabase } from './supabase'

export interface Office {
  id: string
  name: string
  slug: string
  logo_url: string | null
  bio: string | null
  phone: string | null
  city: string | null
  owner_user_id: string
  created_at: string
}

export interface OfficeMember {
  id: string
  office_id: string
  user_id: string | null
  email: string
  role: string      // owner | agent
  status: string    // invited | active
  created_at: string
}

/** URL-safe slug from an office name. */
export function slugify(name: string): string {
  return (
    name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'office'
  )
}

/** The office owned by the current user (one office per owner), or null. */
export async function getMyOffice(userId: string): Promise<Office | null> {
  const { data } = await supabase
    .from('offices').select('*').eq('owner_user_id', userId).maybeSingle()
  return (data as Office) ?? null
}

export async function getOfficeBySlug(slug: string): Promise<Office | null> {
  const { data } = await supabase
    .from('offices').select('*').eq('slug', slug).maybeSingle()
  return (data as Office) ?? null
}

export async function getOfficeMembers(officeId: string): Promise<OfficeMember[]> {
  const { data } = await supabase
    .from('office_members').select('*').eq('office_id', officeId).order('created_at')
  return (data as OfficeMember[]) ?? []
}

/** Activate any pending office invites addressed to this signed-in user's email. */
export async function acceptOfficeInvites(userId: string, email: string | null | undefined): Promise<void> {
  if (!email) return
  try {
    await supabase.from('office_members')
      .update({ user_id: userId, status: 'active' })
      .eq('email', email.toLowerCase())
      .neq('status', 'active')
  } catch { /* non-fatal */ }
}
