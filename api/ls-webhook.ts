/**
 * Vercel serverless function: POST /api/ls-webhook
 *
 * Receives Lemon Squeezy event notifications and mirrors subscription state
 * into the user_subscriptions table.  Also locks/unlocks listings based on
 * subscription state so a cancelled agent's listings disappear from search.
 *
 * Security
 * --------
 * LS signs every event with HMAC-SHA256 over the raw request body using your
 * webhook's signing secret.  Header is X-Signature (hex).  Without verification
 * anyone who knows the URL could POST arbitrary JSON to "create" themselves an
 * Agency subscription — so if LEMONSQUEEZY_WEBHOOK_SECRET is not set we reject
 * with 500 (fail-closed).
 *
 * Required env vars:
 *   VITE_SUPABASE_URL              shared with frontend
 *   SUPABASE_SERVICE_ROLE_KEY      bypasses RLS for the upsert
 *   LEMONSQUEEZY_WEBHOOK_SECRET    signing secret from dashboard → Settings → Webhooks
 *   VITE_LS_VARIANT_STARTER        ₪100/mo  – "starter" plan
 *   VITE_LS_VARIANT_PRO            ₪200/mo  – "pro" plan
 *   VITE_LS_VARIANT_AGENCY         ₪400/mo  – "agency" plan
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Raw body needed for signature verification.
export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function verifyLsSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  if (signature.length !== expected.length) return false
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expected, 'utf-8'),
    )
  } catch {
    return false
  }
}

function planFromVariantId(variantId: string | number | undefined | null): string {
  const v = variantId == null ? '' : String(variantId)
  if (v === process.env.VITE_LS_VARIANT_OFFICE)  return 'office'
  if (v === process.env.VITE_LS_VARIANT_AGENCY)  return 'agency'
  if (v === process.env.VITE_LS_VARIANT_PRO)     return 'pro'
  if (v === process.env.VITE_LS_VARIANT_STARTER) return 'starter'
  return 'starter'
}

// Which listing columns each boost type sets when a one-time boost is purchased.
const BOOST_COLUMNS: Record<string, (until: string) => Record<string, unknown>> = {
  bump:      (until) => ({ bump_until: until }),
  featured:  (until) => ({ is_featured: true, featured_until: until }),
  spotlight: (until) => ({ spotlight_until: until }),
  tag:       (until) => ({ tag_kind: 'hot', tag_until: until }),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activateBoost(res: VercelResponse, event: any, custom: any): Promise<VercelResponse> {
  const listingId: string | null = custom?.listing_id ?? null
  const boostType = String(custom?.boost_type ?? '')
  const days = Number(custom?.days ?? 7)
  const build = BOOST_COLUMNS[boostType]
  if (!listingId || !build || !Number.isFinite(days)) {
    return res.status(200).json({ received: true, skipped: 'boost_bad_data' })
  }
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
  try {
    await supabase.from('listings').update(build(expiresAt)).eq('id', listingId)
    await supabase.from('boost_orders').insert({
      listing_id: listingId,
      boost_type: boostType,
      days,
      amount: (Number(event?.data?.attributes?.total) || 0) / 100,
      tag_kind: boostType === 'tag' ? 'hot' : null,
      expires_at: expiresAt,
      status: 'active',
      ls_order_id: event?.data?.id != null ? String(event.data.id) : null,
    })
    return res.status(200).json({ received: true, event: 'boost_activated' })
  } catch (err) {
    console.error('[ls-webhook] boost activation error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[ls-webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set')
    return res.status(500).json({ error: 'webhook_secret_not_configured' })
  }

  const signature = req.headers['x-signature']
  if (typeof signature !== 'string' || !signature) {
    return res.status(400).json({ error: 'missing_signature' })
  }

  const rawBody = await readRawBody(req)
  if (!verifyLsSignature(rawBody, signature, secret)) {
    console.error('[ls-webhook] Invalid signature — rejected')
    return res.status(400).json({ error: 'invalid_signature' })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'invalid_json' })
  }

  const eventName: string = event?.meta?.event_name ?? ''
  const customData: any = event?.meta?.custom_data ?? {}
  const userId: string | null = customData?.user_id ?? null

  // One-time boost purchase (a listing boost, not a subscription).
  if (eventName === 'order_created' && customData?.kind === 'boost') {
    return activateBoost(res, event, customData)
  }

  // Otherwise we only care about subscription_* events. Other LS event types
  // (license_key_*, etc.) are acked silently.
  if (!eventName.startsWith('subscription_') || !userId) {
    return res.status(200).json({ received: true, skipped: eventName })
  }

  const attrs: any = event?.data?.attributes ?? {}
  const subscriptionId = event?.data?.id ?? null
  const customerId = attrs?.customer_id ?? null
  const status: string = attrs?.status ?? 'active'
  const trialEndsAt: string | null = attrs?.trial_ends_at ?? null
  const renewsAt: string | null = attrs?.renews_at ?? null
  const endsAt: string | null = attrs?.ends_at ?? null
  const variantId = attrs?.variant_id
  const plan = planFromVariantId(variantId)
  const hasHadTrial = !!trialEndsAt

  try {
    // Upsert on any subscription_* event.  Status field stores the canonical
    // LS state as-is ('on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid'
    // | 'cancelled' | 'expired') so the Profile UI can render each accurately.
    // customer_portal_url is captured here so /api/ls-portal can serve it
    // without needing a server-side LS API key.
    const customerPortalUrl: string | null = attrs?.urls?.customer_portal ?? null
    await supabase.from('user_subscriptions').upsert({
      user_id: userId,
      ls_subscription_id: subscriptionId ? String(subscriptionId) : null,
      ls_customer_id: customerId != null ? String(customerId) : null,
      ls_customer_portal_url: customerPortalUrl,
      plan,
      status,
      has_had_trial: hasHadTrial,
      trial_ends_at: trialEndsAt,
      current_period_ends_at: endsAt ?? renewsAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Lock/unlock listings.  A 'cancelled' status still has access until
    // ends_at fires, so keep listings visible; LS will fire subscription_expired
    // when the paid window actually ends and we'll lock then.
    const activeStatuses = new Set(['on_trial', 'active', 'cancelled'])
    const isActive = activeStatuses.has(status)
    await supabase.from('listings')
      .update({ is_locked: !isActive })
      .eq('posted_by_user_id', userId)

    return res.status(200).json({ received: true, event: eventName })
  } catch (err) {
    console.error('[ls-webhook] Handler error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
}
