/**
 * Vercel serverless function: POST /api/grow-checkout
 *
 * Verifies the authenticated user and returns the Grow hosted payment-page URL
 * for their chosen plan (or a listing boost), with the user's email prefilled
 * and their user_id attached as a custom field. Frontend redirects there.
 *
 * Grow's dashboard-created pages are static URLs (set in env). We append the
 * payer email + our ids as query params so the /api/grow-webhook can attribute
 * the payment. This is best-effort: if the hosted page ignores unknown params,
 * attribution still falls back to the email the customer enters (which is why
 * the UI tells them to pay with their account email).
 *
 * Request body: { plan: 'starter'|'pro'|'agency'|'office' }
 *            or { kind: 'boost', boostType: 'bump'|'tag'|'featured'|'spotlight', listingId }
 * Headers:      Authorization: Bearer <supabase-access-token>
 *
 * Required env vars:
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   VITE_GROW_PAGE_STARTER|PRO|AGENCY|OFFICE            full hosted page URLs
 *   VITE_GROW_PAGE_BOOST_BUMP|TAG|FEATURED|SPOTLIGHT    (optional) boost page URLs
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PLAN_PAGES: Record<string, string | undefined> = {
  starter: process.env.VITE_GROW_PAGE_STARTER,
  pro:     process.env.VITE_GROW_PAGE_PRO,
  agency:  process.env.VITE_GROW_PAGE_AGENCY,
  office:  process.env.VITE_GROW_PAGE_OFFICE,
}
const BOOST_PAGES: Record<string, string | undefined> = {
  bump:      process.env.VITE_GROW_PAGE_BOOST_BUMP,
  tag:       process.env.VITE_GROW_PAGE_BOOST_TAG,
  featured:  process.env.VITE_GROW_PAGE_BOOST_FEATURED,
  spotlight: process.env.VITE_GROW_PAGE_BOOST_SPOTLIGHT,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'missing_auth' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) return res.status(401).json({ error: 'invalid_token' })
  const user = userData.user

  const { plan, kind, boostType, listingId } = (req.body ?? {}) as {
    plan?: string; kind?: string; boostType?: string; listingId?: string
  }

  let base: string | undefined
  let listingIdForField: string | undefined

  if (kind === 'boost') {
    if (!boostType || !BOOST_PAGES[boostType]) return res.status(400).json({ error: 'boost_not_configured' })
    if (!listingId) return res.status(400).json({ error: 'missing_listingId' })
    base = BOOST_PAGES[boostType]
    listingIdForField = listingId
    // Record the intent so /api/grow-webhook can tie the payment to this listing
    // even if the hosted page doesn't echo our custom field back.
    await supabase.from('pending_boosts').insert({
      user_id: user.id, listing_id: listingId, boost_type: boostType,
    })
  } else {
    if (!plan) return res.status(400).json({ error: 'missing_plan' })
    if (!PLAN_PAGES[plan]) return res.status(400).json({ error: 'plan_not_configured' })
    base = PLAN_PAGES[plan]
  }

  let url: URL
  try {
    url = new URL(base!)
  } catch {
    return res.status(500).json({ error: 'bad_page_url' })
  }

  // Prefill payer email (primary attribution signal) + pass ids as custom fields.
  if (user.email) url.searchParams.set('payerEmail', user.email)
  url.searchParams.set('cField1', user.id)
  if (listingIdForField) url.searchParams.set('cField2', listingIdForField)

  return res.status(200).json({ url: url.toString() })
}
