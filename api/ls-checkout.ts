/**
 * Vercel serverless function: POST /api/ls-checkout
 *
 * Builds a Lemon Squeezy hosted checkout URL for the authenticated user's
 * chosen plan and returns it.  Frontend redirects there.
 *
 * We use LS's URL-based checkout (bebkey.lemonsqueezy.com/buy/<uuid>) instead
 * of the API-based /v1/checkouts create-session endpoint so we don't need a
 * server-side LEMONSQUEEZY_API_KEY at runtime.  Custom data (user_id + plan)
 * flows back verbatim in webhook events as meta.custom_data — that's how
 * /api/ls-webhook links the payment to a Supabase user.
 *
 * Request body: { variantId: string, plan: 'starter' | 'pro' | 'agency' }
 * Headers:      Authorization: Bearer <supabase-access-token>
 *
 * Required env vars:
 *   VITE_SUPABASE_URL              shared with frontend
 *   SUPABASE_SERVICE_ROLE_KEY      bypasses RLS for the user lookup
 *   VITE_LS_STORE_SUBDOMAIN        e.g. 'bebkey' → bebkey.lemonsqueezy.com
 *   VITE_LS_VARIANT_STARTER        variant UUID allow-list
 *   VITE_LS_VARIANT_PRO
 *   VITE_LS_VARIANT_AGENCY
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const subdomain = process.env.VITE_LS_STORE_SUBDOMAIN
  if (!subdomain) return res.status(500).json({ error: 'lemonsqueezy_not_configured' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'missing_auth' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) return res.status(401).json({ error: 'invalid_token' })
  const user = userData.user

  const { variantId, plan, kind, listingId, boostType, days } = (req.body ?? {}) as {
    variantId?: string; plan?: string; kind?: string
    listingId?: string; boostType?: string; days?: number
  }
  if (!variantId) return res.status(400).json({ error: 'missing_variantId' })

  // Allow-list: prevent someone crafting a request with an arbitrary variant
  // (e.g. a ₪1 test variant) that would get treated as a paid plan/boost.
  const subVariants = new Set([
    process.env.VITE_LS_VARIANT_STARTER,
    process.env.VITE_LS_VARIANT_PRO,
    process.env.VITE_LS_VARIANT_AGENCY,
    process.env.VITE_LS_VARIANT_OFFICE,
  ].filter(Boolean))
  const boostVariants = new Set([
    process.env.VITE_LS_VARIANT_BOOST_BUMP,
    process.env.VITE_LS_VARIANT_BOOST_FEATURED,
    process.env.VITE_LS_VARIANT_BOOST_SPOTLIGHT,
    process.env.VITE_LS_VARIANT_BOOST_TAG,
  ].filter(Boolean))

  const isBoost = kind === 'boost' || boostVariants.has(variantId)

  // LS URL-based checkout with prefilled email + custom data. The custom fields
  // echo back to us in every webhook event as meta.custom_data.
  const params = new URLSearchParams()
  if (user.email) params.append('checkout[email]', user.email)
  params.append('checkout[custom][user_id]', user.id)

  if (isBoost) {
    if (!boostVariants.has(variantId)) return res.status(400).json({ error: 'unknown_variant_id' })
    if (!listingId || !boostType) return res.status(400).json({ error: 'missing_boost_fields' })
    params.append('checkout[custom][kind]', 'boost')
    params.append('checkout[custom][listing_id]', listingId)
    params.append('checkout[custom][boost_type]', boostType)
    params.append('checkout[custom][days]', String(days ?? 7))
  } else {
    if (!subVariants.has(variantId)) return res.status(400).json({ error: 'unknown_variant_id' })
    if (!plan) return res.status(400).json({ error: 'missing_plan' })
    params.append('checkout[custom][plan]', plan)
  }

  const url = `https://${subdomain}.lemonsqueezy.com/buy/${variantId}?${params.toString()}`
  return res.status(200).json({ url })
}
