/**
 * Vercel serverless function: POST /api/contact
 *
 * Handles submissions from the public /contact page:
 *   1. Validates input (type-narrowing + length + category whitelist)
 *   2. Rejects honeypot-filled requests (bots)
 *   3. Soft-rate-limits by (ip, email) - one submit per 60s
 *   4. Inserts into contact_messages (service-role key, bypasses RLS)
 *   5. Sends an email to support@bebkey.com via Resend so the team sees it
 *
 * Env vars required:
 *   VITE_SUPABASE_URL              shared with frontend
 *   SUPABASE_SERVICE_ROLE_KEY      bypasses RLS for the insert
 *   RESEND_API_KEY                 sends the notification email (optional -
 *                                  if unset, the insert still succeeds but
 *                                  no email goes out and a warning is logged)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_CATEGORIES = new Set([
  'general',
  'listing_issue',
  'agent_plans',
  'bug',
  'press',
  'privacy',
])

// Where contact-form submissions are delivered.  We send FROM the
// brand-facing `BebKey <support@bebkey.com>` (Resend allows any verified-
// domain address as the From), but route TO whichever real mailbox can
// actually receive mail - `doron@bebkey.com` by default, since that's the
// one configured on the bebkey.com domain and used by scraper alerts.
// Override via `CONTACT_FORWARD_TO` in Vercel env vars if/when you set up
// a proper `support@` alias.
const SUPPORT_EMAIL = process.env.CONTACT_FORWARD_TO ?? 'doron@bebkey.com'
const RESEND_FROM   = 'BebKey <support@bebkey.com>'

// Soft in-memory rate limit (per warm Lambda instance).  Not perfect across
// cold starts but enough to block trivial form-spam scripts.  For a hardened
// rate-limit, move this to a Supabase RPC counter keyed on (ip, email).
const recentSubmissions = new Map<string, number>()
const RATE_LIMIT_WINDOW_MS = 60_000

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim()
  if (Array.isArray(fwd)) return fwd[0]!.split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendSupportEmail(payload: {
  name: string
  email: string
  phone: string | null
  category: string
  listingUrl: string | null
  message: string
  id: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[contact] RESEND_API_KEY not set - email skipped')
    return
  }

  const subject = `[BebKey contact / ${payload.category}] ${payload.name}`
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                background:#f0f4ff;padding:24px 16px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
                  overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="background:#1A56DB;padding:16px 24px;color:#fff">
          <strong style="font-size:1rem">New contact message</strong>
          <div style="opacity:.8;font-size:.85rem;margin-top:2px">Category: ${escapeHtml(payload.category)}</div>
        </div>
        <div style="padding:24px;color:#111827;font-size:.92rem;line-height:1.55">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7280;width:90px">From</td>
                <td style="padding:6px 0">${escapeHtml(payload.name)} &lt;${escapeHtml(payload.email)}&gt;</td></tr>
            ${payload.phone ? `
            <tr><td style="padding:6px 0;color:#6b7280">Phone</td>
                <td style="padding:6px 0">${escapeHtml(payload.phone)}</td></tr>` : ''}
            ${payload.listingUrl ? `
            <tr><td style="padding:6px 0;color:#6b7280">Listing</td>
                <td style="padding:6px 0"><a href="${escapeHtml(payload.listingUrl)}">${escapeHtml(payload.listingUrl)}</a></td></tr>` : ''}
          </table>
          <hr style="border:none;border-top:1px solid #f0f4ff;margin:16px 0">
          <div style="white-space:pre-wrap">${escapeHtml(payload.message)}</div>
          <p style="margin-top:24px;font-size:.75rem;color:#9ca3af">
            Ref #${payload.id.slice(0, 8)} · received ${new Date().toUTCString()}
          </p>
        </div>
      </div>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [SUPPORT_EMAIL],
        reply_to: payload.email,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[contact] Resend send failed:', res.status, body)
    }
  } catch (err) {
    console.error('[contact] Resend send threw:', err)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const body = req.body as Record<string, unknown> | undefined
  if (!body) return res.status(400).json({ error: 'missing_body' })

  // ── Honeypot - hidden form field bots will fill in, real users will not ─
  if (isString(body.website) && body.website.trim().length > 0) {
    // Silently accept so the bot thinks it succeeded.  No DB write, no email.
    return res.status(200).json({ ok: true })
  }

  // ── Type-narrow + validate ──────────────────────────────────────────────
  const name        = isString(body.name)        ? body.name.trim()        : ''
  const email       = isString(body.email)       ? body.email.trim()       : ''
  const phone       = isString(body.phone)       ? body.phone.trim()       : ''
  const category    = isString(body.category)    ? body.category           : ''
  const listingUrl  = isString(body.listingUrl)  ? body.listingUrl.trim()  : ''
  const message     = isString(body.message)     ? body.message.trim()     : ''

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'invalid_name' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: 'invalid_email' })
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'invalid_category' })
  }
  if (message.length < 10 || message.length > 4000) {
    return res.status(400).json({ error: 'invalid_message' })
  }
  if (phone.length > 30) {
    return res.status(400).json({ error: 'invalid_phone' })
  }
  if (listingUrl.length > 500) {
    return res.status(400).json({ error: 'invalid_listing_url' })
  }

  // ── Soft rate-limit ─────────────────────────────────────────────────────
  const ip = clientIp(req)
  const rateKey = `${ip}::${email.toLowerCase()}`
  const last = recentSubmissions.get(rateKey)
  const now  = Date.now()
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({ error: 'rate_limited' })
  }
  recentSubmissions.set(rateKey, now)
  // Prune old entries opportunistically so the map doesn't grow unbounded
  if (recentSubmissions.size > 500) {
    for (const [k, v] of recentSubmissions) {
      if (now - v > RATE_LIMIT_WINDOW_MS) recentSubmissions.delete(k)
    }
  }

  // ── Insert ──────────────────────────────────────────────────────────────
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const userAgent = isString(req.headers['user-agent']) ? req.headers['user-agent'] : null

  const { data, error } = await supabase
    .from('contact_messages')
    .insert({
      name,
      email,
      phone:       phone || null,
      category,
      listing_url: listingUrl || null,
      message,
      ip_address:  ip === 'unknown' ? null : ip,
      user_agent:  userAgent,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[contact] insert failed:', error)
    return res.status(500).json({ error: 'insert_failed' })
  }

  // ── Email notification (fire-and-forget - don't block the response) ─────
  // We still await it inside the function lifetime because Vercel will
  // freeze the lambda the moment the response is sent.  But we catch all
  // errors so a Resend hiccup doesn't break the form.
  await sendSupportEmail({
    name,
    email,
    phone:      phone || null,
    category,
    listingUrl: listingUrl || null,
    message,
    id:         data.id,
  })

  return res.status(200).json({ ok: true, id: data.id })
}
