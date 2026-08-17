/**
 * Vercel serverless function: GET /api/source-redirect?id=<uuid>
 *
 * Click-time validator for "View on Yad2 / Madlan / OnMap / ..." links.
 *
 * Flow:
 *   1. Look up the listing by id.  If inactive → redirect back to
 *      /listing/:id?inactive=1 (front-end shows banner).
 *   2. Quick HEAD on source_url (≤4s).
 *   3. If HEAD returns 404 OR redirects to the site's homepage:
 *        - mark listings.is_active = false
 *        - return user to /listing/:id?inactive=1
 *   4. Otherwise 302 to source_url so the user opens the actual listing.
 *
 * Catches stale listings BETWEEN scraper runs (currently scrapers run
 * every 12h; deactivate_stale.py thresholds are 2-21 days).  Without
 * this endpoint a user could click a listing that died 11 hours ago
 * and land on a 404.
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const HEAD_TIMEOUT_MS = 4000

// Sources behind aggressive bot-protection (ShieldSquare / PerimeterX /
// DataDome) that challenge datacenter IPs. A HEAD from Vercel gets bounced to
// a bot-wall URL that looks like a dead/homepage redirect, so liveness-checking
// these would wrongly deactivate LIVE listings and break "View on …". Real
// browsers pass the challenge, so just send the user straight through.
const SKIP_LIVENESS = new Set(['yad2', 'madlan'])

// A redirect to one of these (captcha / bot-wall) hosts is NOT proof a listing
// died — never treat it as 'dead'.
const CHALLENGE_HOST = /(perfdrive\.com|shieldsquare|perimeterx|datadome|px-cloud|hcaptcha|recaptcha|captcha)/i

// Homepage-redirect heuristics - mirrors deactivate_stale.py.is_homepage_redirect.
// If a HEAD request follows redirects and lands somewhere that doesn't look
// like a listing detail page, treat as dead.
function isHomepageRedirect(finalUrl: string, source: string | null): boolean {
  const u = finalUrl.replace(/\/+$/, '')
  switch (source) {
    case 'yad2':            return !u.includes('/item/')
    case 'madlan':          return (new URL(u).pathname.split('/').filter(Boolean).length < 2)
    case 'janglo':          return !u.includes('/item/')
    case 'onmap':           return !u.includes('/home-details/') && !u.includes('/en/home-details/')
    case 'facebook':        return !u.includes('/marketplace/item/')
    case 'facebook_groups': return !u.includes('/posts/') && !u.includes('/permalink/')
    case 'jpost':           return !u.includes('/estate_property/')
    case 'komo':            return !u.includes('modaaNum=') && !u.includes('adid=')
    case 'telegram':        return !/t\.me\/.+\/\d+/.test(u)
    default:                return false
  }
}

async function checkUrl(url: string, source: string | null): Promise<'alive' | 'dead' | 'unknown'> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS)
    const resp = await fetch(url, {
      method:   'HEAD',
      redirect: 'follow',
      signal:   controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BebKeyBot/1.0; +https://bebkey.com)',
        'Accept':     'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(t)
    if (resp.status === 404 || resp.status === 410) return 'dead'
    if (resp.status >= 500) return 'unknown'   // server hiccup - don't kill the listing
    // A bounce to a bot-wall/captcha host means we got challenged, not that the
    // listing is gone - let the user through and never deactivate.
    if (resp.url && CHALLENGE_HOST.test(resp.url)) return 'unknown'
    // Detect silent homepage redirects
    if (resp.url && resp.url !== url && isHomepageRedirect(resp.url, source)) return 'dead'
    if (resp.status >= 200 && resp.status < 400) return 'alive'
    return 'unknown'
  } catch {
    // Timeout or network error - don't punish the listing; let the user through
    return 'unknown'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) {
    return res.status(400).json({ error: 'missing_id' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // 1) Look up the listing
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, source, source_url, is_active')
    .eq('id', id)
    .single()

  if (error || !listing) {
    return res.redirect(302, `/listing/${id}?inactive=1`)
  }
  if (!listing.is_active) {
    return res.redirect(302, `/listing/${id}?inactive=1`)
  }
  if (!listing.source_url) {
    return res.redirect(302, `/listing/${id}?nourl=1`)
  }

  // Bot-protected sources (Yad2/Madlan) can't be liveness-checked from a
  // datacenter IP without false "dead" verdicts - send the user straight there.
  if (SKIP_LIVENESS.has(listing.source ?? '')) {
    return res.redirect(302, listing.source_url)
  }

  // 2) Quick HEAD check
  const verdict = await checkUrl(listing.source_url, listing.source)

  // 3) If dead, deactivate + bounce back to listing page
  if (verdict === 'dead') {
    await supabase
      .from('listings')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', id)
    return res.redirect(302, `/listing/${id}?inactive=1`)
  }

  // 4) Alive or unknown - let the user through
  return res.redirect(302, listing.source_url)
}
