/**
 * Vercel serverless function: POST /api/grow-webhook
 *
 * Receives Grow (Meshulam) payment notifications for our hosted payment pages
 * and mirrors subscription state into user_subscriptions, locking/unlocking a
 * user's listings with their subscription. Also activates one-time listing
 * boosts.
 *
 * Security
 * --------
 * Grow does NOT HMAC-sign the body. Instead every webhook carries the account's
 * secret `webhookKey`, plus (optionally) a constant "identifier" value we set on
 * the webhook config ("פרמטר מזהה"). We fail-closed: if GROW_WEBHOOK_KEY is not
 * set we reject, and we reject any payload whose webhookKey doesn't match.
 *
 * Transport: Grow may POST JSON or application/x-www-form-urlencoded — we parse
 * whichever arrives, and also tolerate the fields being nested under `data`.
 *
 * Attribution (no clearing API => nothing injected per-user at redirect time):
 *   * plan     — from which page was paid: purchasePageKey -> GROW_PAGEKEY_*
 *   * user     — recurring id (renewals) -> custom field user_id -> payer email
 *   * renewals — matched by recurringDebitId captured on the first charge
 * Anything we can't attribute is stored in grow_unmatched_payments (never lost).
 *
 * Required env vars:
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GROW_WEBHOOK_KEY                     comma-separated webhook keys (one per
 *                                        Grow webhook: transactions + recurring)
 *   GROW_WEBHOOK_IDENTIFIER              (optional) the constant identifier param
 *   GROW_PRICE_STARTER|PRO|AGENCY|OFFICE            (optional) override plan prices
 *                                        (default 100/200/400/700) — plan is
 *                                        attributed by charged amount.
 *   GROW_PAGEKEY_STARTER|PRO|AGENCY|OFFICE          (optional) page key -> plan override
 *   GROW_PAGEKEY_BOOST_BUMP|TAG|FEATURED|SPOTLIGHT  (optional) page key -> boost
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

// Raw body needed so we can parse either JSON or form-urlencoded ourselves.
export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// One "month" of access granted per successful charge (a couple days of slack
// so a renewal that lands slightly late never briefly locks a paying user).
const PERIOD_MS = 33 * 86_400_000

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBody(raw: string, contentType: string): Record<string, any> {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') || (contentType || '').toLowerCase().includes('json')) {
    try { return JSON.parse(trimmed) } catch { /* fall through to form parsing */ }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v
  return out
}

// Fields sometimes arrive nested under `data`; flatten so lookups are uniform
// (top-level keys such as webhookKey win over anything in data).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatten(body: Record<string, any>): Record<string, any> {
  const data = body && typeof body.data === 'object' && body.data ? body.data : {}
  return { ...data, ...body }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  try { return timingSafeEqual(ab, bb) } catch { return false }
}

// Pull our custom values out of whichever custom-field shape Grow used:
// purchaseCustomField (object or JSON string), dynamicFields ([{name,value}]),
// or flat cField1..cField5.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readCustom(f: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {}
  let pcf = f.purchaseCustomField
  if (typeof pcf === 'string') { try { pcf = JSON.parse(pcf) } catch { pcf = null } }
  if (pcf && typeof pcf === 'object') {
    for (const [k, v] of Object.entries(pcf)) if (v != null) out[k] = String(v)
  }
  const df = f.dynamicFields
  if (Array.isArray(df)) {
    for (const item of df) {
      const k = item?.name ?? item?.key ?? item?.title
      const v = item?.value ?? item?.val
      if (k != null && v != null) out[String(k)] = String(v)
    }
  }
  for (let i = 1; i <= 5; i++) {
    const v = f[`cField${i}`]
    if (v != null && v !== '') out[`cField${i}`] = String(v)
  }
  return out
}

function planForPageKey(key: string): string | null {
  if (!key) return null
  const map: Record<string, string> = {}
  const add = (k: string | undefined, plan: string) => { if (k) map[k] = plan }
  add(process.env.GROW_PAGEKEY_STARTER, 'starter')
  add(process.env.GROW_PAGEKEY_PRO, 'pro')
  add(process.env.GROW_PAGEKEY_AGENCY, 'agency')
  add(process.env.GROW_PAGEKEY_OFFICE, 'office')
  return map[key] ?? null
}

// Primary plan attribution: the four plan prices are all distinct, so the
// charged amount uniquely identifies the plan — no per-page config needed.
// Overridable via GROW_PRICE_* env if prices ever change.
function planForAmount(sum: number | null): string | null {
  if (!sum) return null
  const map: Record<string, string> = {}
  const add = (envVal: string | undefined, def: string, plan: string) => { map[String(Math.round(Number(envVal || def)))] = plan }
  add(process.env.GROW_PRICE_STARTER, '100', 'starter')
  add(process.env.GROW_PRICE_PRO, '200', 'pro')
  add(process.env.GROW_PRICE_AGENCY, '400', 'agency')
  add(process.env.GROW_PRICE_OFFICE, '700', 'office')
  return map[String(Math.round(sum))] ?? null
}

function boostForPageKey(key: string): string | null {
  if (!key) return null
  const map: Record<string, string> = {}
  const add = (k: string | undefined, b: string) => { if (k) map[k] = b }
  add(process.env.GROW_PAGEKEY_BOOST_BUMP, 'bump')
  add(process.env.GROW_PAGEKEY_BOOST_TAG, 'tag')
  add(process.env.GROW_PAGEKEY_BOOST_FEATURED, 'featured')
  add(process.env.GROW_PAGEKEY_BOOST_SPOTLIGHT, 'spotlight')
  return map[key] ?? null
}

// Boost prices are distinct (₪9/19/49/99) and don't collide with plan prices,
// so the charged amount identifies the boost — no per-page config needed.
function boostForAmount(sum: number | null): string | null {
  if (!sum) return null
  const map: Record<string, string> = {}
  const add = (envVal: string | undefined, def: string, b: string) => { map[String(Math.round(Number(envVal || def)))] = b }
  add(process.env.GROW_PRICE_BOOST_TAG, '9', 'tag')
  add(process.env.GROW_PRICE_BOOST_BUMP, '19', 'bump')
  add(process.env.GROW_PRICE_BOOST_FEATURED, '49', 'featured')
  add(process.env.GROW_PRICE_BOOST_SPOTLIGHT, '99', 'spotlight')
  return map[String(Math.round(sum))] ?? null
}

// Which listing columns each boost type sets when purchased.
const BOOST_COLUMNS: Record<string, (until: string) => Record<string, unknown>> = {
  bump:      (until) => ({ bump_until: until }),
  featured:  (until) => ({ is_featured: true, featured_until: until }),
  spotlight: (until) => ({ spotlight_until: until }),
  tag:       (until) => ({ tag_kind: 'hot', tag_until: until }),
}
const BOOST_DAYS: Record<string, number> = { bump: 7, featured: 14, spotlight: 7, tag: 7 }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  // Grow report types are mutually exclusive per webhook, so we run TWO webhooks
  // (one for transactions, one for standing-order runs), each with its own key.
  // GROW_WEBHOOK_KEY holds both, comma-separated; a payload must match one.
  const expectedKeys = (process.env.GROW_WEBHOOK_KEY || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (!expectedKeys.length) {
    console.error('[grow-webhook] GROW_WEBHOOK_KEY is not set — rejecting')
    return res.status(500).json({ error: 'webhook_key_not_configured' })
  }

  const raw = await readRawBody(req)
  const f = flatten(parseBody(raw, String(req.headers['content-type'] || '')))

  const gotKey = String(f.webhookKey ?? f.webhook_key ?? '')
  if (!expectedKeys.some(k => safeEqual(gotKey, k))) {
    console.error('[grow-webhook] invalid webhookKey — rejected')
    return res.status(401).json({ error: 'invalid_webhook_key' })
  }

  // Optional second factor: a constant identifier we configured on the webhook.
  const wantId = process.env.GROW_WEBHOOK_IDENTIFIER
  if (wantId) {
    const gotId = String(f.identifier ?? f.customParam ?? f.param ?? f.identifierParam ?? '')
    if (gotId && !safeEqual(gotId, wantId)) {
      console.error('[grow-webhook] identifier mismatch — rejected')
      return res.status(401).json({ error: 'invalid_identifier' })
    }
  }

  // --- extract the fields we care about (tolerant of naming variants) --------
  const payerEmail = String(f.payerEmail ?? f.email ?? '').trim()
  const fullName = f.fullName ?? f.payerName ?? f.full_name ?? null
  const payerPhone = f.payerPhone ?? f.phone ?? null
  const paymentSum = Number(f.paymentSum ?? f.sum ?? f.amount ?? 0) || null
  const paymentType = String(f.paymentType ?? '')
  const asmachta = f.asmachta != null ? String(f.asmachta) : null
  const transactionId = String(f.transactionId ?? f.transactionCode ?? f.transactionToken ?? '') || null
  const recurringId = f.recurringDebitId != null && f.recurringDebitId !== ''
    ? String(f.recurringDebitId) : null
  const pageKey = String(f.purchasePageKey ?? f.paymentLinkProcessId ?? f.pageCode ?? '')
  const custom = readCustom(f)

  // Log structure only (no PII) so the first real payment lets us confirm the
  // exact payload shape without dumping emails/cards into the logs.
  console.log('[grow-webhook] keys=%s type=%s pageKey=%s recurring=%s',
    Object.keys(f).join(','), paymentType, pageKey || '-', recurringId ? 'y' : 'n')

  // Explicit failure signal (e.g. a failed recurring run). Conservative: only
  // treat as failure on a clear indicator, otherwise assume a successful charge.
  const statusStr = `${f.status ?? ''} ${f.statusCode ?? ''} ${f.err ?? f.error ?? ''}`.toLowerCase()
  const looksFailed = /\b(fail|failed|declin|reject|error|cancel)\b|נכשל|בוטל|נדחה/.test(statusStr)

  // --- resolve the user ------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existing: any = null
  let userId: string | null = null
  let isRenewal = false

  if (recurringId) {
    const { data } = await supabase.from('user_subscriptions')
      .select('user_id, grow_last_asmachta').eq('grow_recurring_id', recurringId).maybeSingle()
    if (data?.user_id) { userId = data.user_id; existing = data; isRenewal = true }
  }
  if (!userId) {
    const cid = custom.user_id || custom.userId || custom.cField1
    if (cid && UUID_RE.test(cid)) userId = cid
  }
  if (!userId && payerEmail) {
    const { data } = await supabase.rpc('get_user_id_by_email', { p_email: payerEmail })
    if (typeof data === 'string') userId = data
  }

  // Idempotency: Grow may retry. If we already recorded this exact transaction
  // for this user, ack without re-crediting another period.
  if (userId && asmachta) {
    if (!existing) {
      const { data } = await supabase.from('user_subscriptions')
        .select('grow_last_asmachta').eq('user_id', userId).maybeSingle()
      existing = data
    }
    if (existing?.grow_last_asmachta && existing.grow_last_asmachta === asmachta) {
      return res.status(200).json({ received: true, duplicate: true })
    }
  }

  const boostType = boostForPageKey(pageKey)
    || (custom.kind === 'boost' ? custom.boost_type : null)
    || boostForAmount(paymentSum)
  // Prefer explicit page-key mapping if configured; otherwise fall back to the
  // charged amount (plan + boost prices are all distinct, so no collision).
  const plan = planForPageKey(pageKey) || (boostType ? null : planForAmount(paymentSum))
  const nowIso = new Date().toISOString()

  // --- failed recurring charge ----------------------------------------------
  if (looksFailed) {
    if (userId) {
      await supabase.from('user_subscriptions')
        .update({ status: 'past_due', updated_at: nowIso }).eq('user_id', userId)
    }
    console.error('[grow-webhook] charge reported as failed (status=%s) user=%s', statusStr.trim(), userId ? 'y' : 'n')
    return res.status(200).json({ received: true, failed: true })
  }

  // --- one-time boost --------------------------------------------------------
  if (boostType && !plan) {
    let listingId: string | null = custom.listing_id || custom.listingId || custom.cField2 || null
    let pendingId: string | null = null
    // If the listing didn't come through a custom field, match the most recent
    // unfulfilled boost intent this user recorded via /api/grow-checkout.
    if (!listingId && userId) {
      const { data } = await supabase.from('pending_boosts')
        .select('id, listing_id')
        .eq('user_id', userId).eq('boost_type', boostType).eq('fulfilled', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (data) { listingId = data.listing_id; pendingId = data.id }
    }
    const build = BOOST_COLUMNS[boostType]
    if (userId && listingId && build) {
      const until = new Date(Date.now() + (BOOST_DAYS[boostType] ?? 7) * 86_400_000).toISOString()
      try {
        await supabase.from('listings').update(build(until)).eq('id', listingId).eq('posted_by_user_id', userId)
        await supabase.from('boost_orders').insert({
          listing_id: listingId, boost_type: boostType, days: BOOST_DAYS[boostType] ?? 7,
          amount: paymentSum ?? 0, tag_kind: boostType === 'tag' ? 'hot' : null,
          expires_at: until, status: 'active',
          ls_order_id: transactionId,
        })
        if (pendingId) await supabase.from('pending_boosts').update({ fulfilled: true }).eq('id', pendingId)
        return res.status(200).json({ received: true, boost: boostType })
      } catch (err) {
        console.error('[grow-webhook] boost activation error:', err)
        return res.status(500).json({ error: 'internal_error' })
      }
    }
    // Boost paid but we can't tie it to a listing — record it, don't lose it.
    await recordUnmatched()
    return res.status(200).json({ received: true, unmatched: 'boost' })
  }

  // --- subscription ----------------------------------------------------------
  if (!userId || !plan) {
    await recordUnmatched()
    console.error('[grow-webhook] unmatched charge hasUser=%s plan=%s pageKey=%s hasEmail=%s',
      !!userId, plan ?? '-', pageKey || '-', !!payerEmail)
    return res.status(200).json({ received: true, unmatched: true })
  }

  try {
    const periodEnd = new Date(Date.now() + PERIOD_MS).toISOString()
    // On the first charge grow_recurring_id may be null (some flows only expose
    // it on later runs) — only overwrite it when we actually have one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {
      user_id: userId,
      plan,
      status: 'active',
      grow_payer_email: payerEmail || null,
      grow_page_key: pageKey || null,
      grow_last_asmachta: asmachta,
      current_period_ends_at: periodEnd,
      updated_at: nowIso,
    }
    if (recurringId) row.grow_recurring_id = recurringId
    await supabase.from('user_subscriptions').upsert(row, { onConflict: 'user_id' })

    // Unlock the user's listings now that they're paid & active.
    await supabase.from('listings').update({ is_locked: false }).eq('posted_by_user_id', userId)

    return res.status(200).json({ received: true, plan, renewal: isRenewal })
  } catch (err) {
    console.error('[grow-webhook] handler error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }

  async function recordUnmatched() {
    try {
      await supabase.from('grow_unmatched_payments').insert({
        payer_email: payerEmail || null,
        full_name: fullName,
        payer_phone: payerPhone,
        page_key: pageKey || null,
        plan: plan ?? null,
        payment_sum: paymentSum,
        payment_type: paymentType || null,
        transaction_id: transactionId,
        asmachta,
        recurring_id: recurringId,
        raw: f,
      })
    } catch (err) {
      console.error('[grow-webhook] failed to record unmatched payment:', err)
    }
  }
}
