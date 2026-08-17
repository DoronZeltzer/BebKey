/**
 * Vercel serverless function: POST /api/ls-portal
 *
 * Returns the LS Customer Portal URL for the authenticated user.  Frontend
 * redirects there — the portal handles cancel, resume, update payment method,
 * and invoice history in one hosted UI.
 *
 * We serve the customer_portal URL from the user_subscriptions row (captured
 * by /api/ls-webhook on every subscription event) instead of calling LS's
 * GET /v1/subscriptions/{id} API — so we don't need a server-side API key.
 *
 * Request body: { } (no body needed — user identified from JWT)
 * Headers:      Authorization: Bearer <supabase-access-token>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'missing_auth' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) return res.status(401).json({ error: 'invalid_token' })

  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('ls_customer_portal_url')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!sub?.ls_customer_portal_url) {
    return res.status(404).json({ error: 'no_portal_url' })
  }

  return res.status(200).json({ url: sub.ls_customer_portal_url })
}
