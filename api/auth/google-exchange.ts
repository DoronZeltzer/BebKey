/**
 * Vercel serverless function: POST /api/auth/google-exchange
 *
 * Receives { code, code_verifier } from the browser's /auth/callback page,
 * exchanges the code with Google's token endpoint to get an id_token,
 * then creates a Supabase session via signInWithIdToken and returns
 * { access_token, refresh_token, expires_in, expires_at } to the client.
 *
 * Required environment variables (set in Vercel dashboard):
 *   GOOGLE_CLIENT_ID      - same client ID used for the OAuth redirect
 *   GOOGLE_CLIENT_SECRET  - keep secret, never expose to the browser
 *   SUPABASE_URL          - e.g. https://fzuadufzqazrvwarnely.supabase.co
 *   SUPABASE_ANON_KEY     - public anon key (safe to use server-side)
 *   GOOGLE_REDIRECT_URI   - must match what's registered in Google Console
 *                           e.g. https://www.bebkey.com/auth/callback
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ── Soft in-memory rate limit (per warm Lambda instance) ────────────────────
// A single browser signing in with Google exchanges the code once, so any
// caller hitting this endpoint more than ~10 times per minute from one IP is
// almost certainly a credential-stuffing bot.  Not perfect across cold starts
// (each new instance has an empty map) but enough to block naive scripting
// without spending on Redis/KV.  For a harder rate-limit, move to a Supabase
// RPC counter keyed on IP.
const recentExchanges = new Map<string, number[]>()
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_WINDOW = 10

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim()
  if (Array.isArray(fwd)) return fwd[0]!.split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function checkRate(ip: string): boolean {
  const now = Date.now()
  const window = now - RATE_WINDOW_MS
  const hits = (recentExchanges.get(ip) ?? []).filter(t => t > window)
  if (hits.length >= RATE_MAX_PER_WINDOW) {
    recentExchanges.set(ip, hits)
    return false
  }
  hits.push(now)
  recentExchanges.set(ip, hits)
  // Opportunistically prune the map so it doesn't grow unbounded across
  // millions of unique client IPs over the life of a warm instance.
  if (recentExchanges.size > 5000) {
    for (const [k, v] of recentExchanges) {
      if (v.every(t => t <= window)) recentExchanges.delete(k)
    }
  }
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = clientIp(req)
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { code, code_verifier } = (req.body ?? {}) as {
    code?: string
    code_verifier?: string
  }

  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'Missing code or code_verifier' })
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI ?? 'https://www.bebkey.com/auth/callback'
  const supabaseUrl  = process.env.SUPABASE_URL
  const supabaseKey  = process.env.SUPABASE_ANON_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error('google-exchange: missing env vars')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  // ── 1. Exchange authorization code for Google tokens ─────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier,
    }),
  })

  const tokens = await tokenRes.json() as {
    id_token?: string
    access_token?: string
    error?: string
    error_description?: string
  }

  if (!tokenRes.ok || !tokens.id_token) {
    console.error('google-exchange: token exchange failed', tokens)
    return res.status(400).json({
      error: tokens.error ?? 'token_exchange_failed',
      details: tokens.error_description,
    })
  }

  // ── 2. Create a Supabase session from the Google ID token ─────────────────
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: tokens.id_token,
  })

  if (error || !data.session) {
    console.error('google-exchange: signInWithIdToken failed', error)
    return res.status(400).json({ error: error?.message ?? 'session_creation_failed' })
  }

  // Return only the tokens the client needs - never return the Google secret
  return res.status(200).json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in:    data.session.expires_in,
    expires_at:    data.session.expires_at,
  })
}
