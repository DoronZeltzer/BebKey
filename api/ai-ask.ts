/**
 * Vercel serverless function: POST /api/ai-ask
 *
 * Answers free-text questions about a specific listing using Claude
 * Haiku grounded on the listing's own data + ai_summary.
 *
 * Counter to keyz.ai's AI chatbot - but ours has 19.5K+ listings and
 * 5-language UI; theirs is a marketplace with near-zero inventory.
 *
 * Request: { listing_id: string, question: string,
 *            history?: {role: 'user'|'assistant', content: string}[],
 *            lang?: 'he'|'en'|'ru'|'ar'|'fr' }
 * Response: { answer: string }
 *
 * Env: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Hard cap on conversation history we'll forward to Claude.  Each round
// is ~200 tokens.  10 rounds × 2 messages = ~4K tokens of context.
const MAX_HISTORY_PAIRS = 10
// Per-question rate limit (warm-Lambda only - fine for a free tier;
// upgrade to Redis if abuse becomes a real problem).
const RATE_LIMIT_WINDOW_MS = 8_000
const recentAsks = new Map<string, number>()

function langInstructions(lang: string): string {
  switch (lang) {
    case 'he': return 'Reply in Hebrew (עברית).  Keep it concise, 2-4 sentences.'
    case 'ru': return 'Reply in Russian (русский).  Keep it concise, 2-4 sentences.'
    case 'ar': return 'Reply in Arabic (العربية).  Keep it concise, 2-4 sentences.'
    case 'fr': return 'Reply in French (français).  Keep it concise, 2-4 sentences.'
    default:   return 'Reply in English.  Keep it concise, 2-4 sentences.'
  }
}

interface ListingRow {
  id: string | number
  city: string | null
  neighborhood: string | null
  street: string | null
  rooms: number | null
  size_m2: number | null
  floor: number | null
  total_floors: number | null
  property_type: string | null
  price: number | null
  deal_type: string | null
  description: string | null
  parking: boolean | null
  elevator: boolean | null
  balcony: boolean | null
  mamad: boolean | null
  furnished: boolean | null
  air_conditioning: boolean | null
  storage_room: boolean | null
  accessible: boolean | null
  condition: string | null
  ai_summary: string | null
  source: string | null
}

function buildSystemPrompt(listing: ListingRow, langHint: string): string {
  const features: string[] = []
  if (listing.parking)          features.push('parking')
  if (listing.elevator)         features.push('elevator')
  if (listing.balcony)          features.push('balcony')
  if (listing.mamad)            features.push('safe room (mamad)')
  if (listing.furnished)        features.push('furnished')
  if (listing.air_conditioning) features.push('air conditioning')
  if (listing.storage_room)     features.push('storage room')
  if (listing.accessible)       features.push('wheelchair accessible')

  // Pull AI-summary fields if available (parsed lazily; ignore failures)
  let summaryEn = ''
  let pros: string[] = []
  let tags: string[] = []
  try {
    if (listing.ai_summary) {
      const s = JSON.parse(listing.ai_summary) as {
        summary_en?: string; pros?: string[]; lifestyle_tags?: string[]
      }
      summaryEn = s.summary_en ?? ''
      pros = s.pros ?? []
      tags = s.lifestyle_tags ?? []
    }
  } catch { /* malformed JSON in column - skip */ }

  const locationLine = [listing.street, listing.neighborhood, listing.city].filter(Boolean).join(', ') || 'Israel (unspecified)'
  return `You are BebKey's listing assistant.  Answer the user's question about THIS specific Israeli real-estate listing.

You have TWO sources of information:
  1. The structured listing data shown below (use this FIRST for anything price/rooms/size/features specific to THIS unit)
  2. The web_search tool (use this when the question is about the surrounding NEIGHBORHOOD / AREA / CITY - schools, safety, family-friendliness, transit, distance to landmarks, demographics, prices in the area, etc.)

When the user asks about neighborhood character, schools, safety, transit, restaurants, parks, religious community, demographics, or anything ABOUT THE AREA rather than this specific unit - USE the web_search tool to look up real, current information.  Search for the neighborhood name + city in Hebrew or English.  Cite the source briefly in your answer.

DO NOT fabricate facts.  If web_search returns nothing useful, say so honestly.

${langInstructions(langHint)}

LISTING DATA (this specific unit)
=================================
Location:     ${locationLine}
Property:     ${listing.property_type || 'apartment'} - ${listing.rooms ?? '?'} rooms, ${listing.size_m2 ?? '?'}m²
Floor:        ${listing.floor ?? '?'}${listing.total_floors ? ' of ' + listing.total_floors : ''}
Deal:         ${listing.deal_type === 'rent' ? 'For rent' : 'For sale'} at ₪${listing.price?.toLocaleString('en-US') ?? '?'}${listing.deal_type === 'rent' ? '/month' : ''}
Condition:    ${listing.condition || 'not specified'}
Features:     ${features.length ? features.join(', ') : 'none listed'}
Description:  ${(listing.description ?? '').slice(0, 600) || 'no description provided'}
${summaryEn ? `\nAI Summary:   ${summaryEn}` : ''}
${pros.length ? `Pros:         ${pros.join(' · ')}` : ''}
${tags.length ? `Vibe tags:    ${tags.join(', ')}` : ''}
Source:       ${listing.source || 'BebKey'}

ANSWERING RULES
===============
1. Be specific.  Quote actual numbers from the listing data when relevant.
2. For NEIGHBORHOOD / AREA questions, USE web_search.  Search queries should include the neighborhood name + city (e.g. "Ramat Ilan Givatayim schools" or "רמת אילן גבעתיים").  Synthesize the search results into a concise answer.
3. If web_search produces conflicting or unclear info, say so and recommend the user verify with the lister or local sources.
4. If the user asks for advice (good deal? family-friendly?), give a brief honest take grounded in BOTH the listing data AND web search results.
5. Never share contact phone numbers (they've been removed from the description for privacy).
6. Refuse politely if asked to do anything unrelated to this listing or its area.
7. Keep the final answer concise (2-4 sentences for short questions, up to 6 for area research).`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const listingId = typeof body.listing_id === 'string' || typeof body.listing_id === 'number'
    ? String(body.listing_id)
    : ''
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const lang = typeof body.lang === 'string' ? body.lang : 'en'

  if (!listingId)                return res.status(400).json({ error: 'missing_listing_id' })
  if (question.length < 2)       return res.status(400).json({ error: 'question_too_short' })
  if (question.length > 500)     return res.status(400).json({ error: 'question_too_long' })

  // Rate limit per (ip + listing) so a single user can't hammer one
  // listing.  Looser than /api/contact because Q&A is the core UX.
  const fwd = req.headers['x-forwarded-for']
  const ip = typeof fwd === 'string'
    ? fwd.split(',')[0]!.trim()
    : Array.isArray(fwd) ? fwd[0]!.split(',')[0]!.trim() : 'unknown'
  const rateKey = `${ip}::${listingId}`
  const now = Date.now()
  const last = recentAsks.get(rateKey)
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({ error: 'rate_limited' })
  }
  recentAsks.set(rateKey, now)
  if (recentAsks.size > 1000) {
    for (const [k, v] of recentAsks) {
      if (now - v > RATE_LIMIT_WINDOW_MS) recentAsks.delete(k)
    }
  }

  // Validate history (optional)
  const history = Array.isArray(body.history) ? body.history : []
  const safeHistory = history
    .filter((m): m is { role: string; content: string } =>
      m !== null && typeof m === 'object'
      && typeof (m as { role?: unknown }).role === 'string'
      && typeof (m as { content?: unknown }).content === 'string'
    )
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY_PAIRS * 2)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 1000) }))

  // Fetch listing
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: listing, error } = await supabase
    .from('listings')
    .select(
      'id,city,neighborhood,street,rooms,size_m2,floor,total_floors,' +
      'property_type,price,deal_type,description,parking,elevator,balcony,' +
      'mamad,furnished,air_conditioning,storage_room,accessible,condition,' +
      'ai_summary,source,is_active'
    )
    .eq('id', listingId)
    .single()
  if (error || !listing) {
    console.error('[ai-ask] listing fetch failed:', error)
    return res.status(404).json({ error: 'listing_not_found' })
  }
  if (!listing.is_active) {
    return res.status(410).json({ error: 'listing_inactive' })
  }

  // Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ai-ask] ANTHROPIC_API_KEY not set')
    return res.status(503).json({ error: 'ai_unavailable' })
  }

  try {
    const messages = [...safeHistory, { role: 'user' as const, content: question }]
    const resp = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       MODEL,
        // 900 → 1500: web_search returns long snippet bundles; Haiku was
        // being truncated mid-answer on neighborhood-research questions
        // and users would see the reply cut off at half a sentence.
        max_tokens:  1500,
        system:      buildSystemPrompt(listing as ListingRow, lang),
        // Server-side web search tool.  Claude decides when to invoke it
        // based on the system prompt's instructions.  max_uses caps the
        // budget per call (each search is one Brave API hit, ~$0.005).
        tools: [{
          type:        'web_search_20250305',
          name:        'web_search',
          max_uses:    3,
        }],
        messages,
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[ai-ask] anthropic error:', resp.status, errText.slice(0, 200))
      return res.status(502).json({ error: 'ai_error' })
    }
    // With server-side web_search, the response contains MULTIPLE
    // content blocks interleaved: text → server_tool_use → web_search_tool_result
    // → text → tool_use → text, etc.  Claude often emits a preamble before
    // searching, then synthesises after.  We CONCATENATE all text blocks
    // in order so the final answer is complete (just grabbing the last
    // block left users with sentence fragments starting with ", and").
    const data = await resp.json() as {
      content?: { type: string; text?: string }[]
    }
    const answer = (data.content ?? [])
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!.trim())
      .filter(Boolean)
      .join(' ')
    if (!answer.trim()) {
      return res.status(502).json({ error: 'ai_empty_response' })
    }
    return res.status(200).json({ answer: answer.trim() })
  } catch (err) {
    console.error('[ai-ask] threw:', err)
    return res.status(502).json({ error: 'ai_call_failed' })
  }
}
