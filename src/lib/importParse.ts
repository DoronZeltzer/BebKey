/**
 * Parse a free-text property post (e.g. copied from a Facebook Marketplace or
 * group listing) into BebKey form fields.
 *
 * This powers the "Import from Facebook" helper on the Submit page.  It is
 * deliberately paste-based: Meta exposes no Marketplace/Groups API, so the only
 * legal way to "import from Facebook" is for the user to paste their OWN post
 * text — which we then best-effort structure.  Everything is heuristic; the
 * user always reviews before publishing.
 *
 * The regexes mirror scrapers/facebook_marketplace_scraper.py so a post reads
 * the same whether our scraper or the user brings it in.
 */
import { CITY_TRANSLATIONS } from './cityNames'

export interface ParsedListing {
  price?: string
  rooms?: string
  size_m2?: string
  city?: string
  deal_type?: 'forsale' | 'rent'
  description?: string
  contact_phone?: string
}

export interface ParseResult {
  fields: ParsedListing
  /** Which fields were detected — drives the "filled N fields" UX message. */
  filled: (keyof ParsedListing)[]
}

// ── Field extractors ──────────────────────────────────────────────────────────

/** Price: only trust a number that sits next to a currency marker, so we don't
 *  mistake a phone number, floor area or year for the price. "1.5 מיליון" too. */
function parsePrice(text: string): number | undefined {
  const mil = text.match(/([\d.]+)\s*(?:מיליון|million)/i)
  if (mil) {
    const v = parseFloat(mil[1])
    if (v > 0 && v < 100) return Math.round(v * 1_000_000)
  }
  const cur = text.match(
    /(?:₪|nis|ש"?ח|שקל)\s*([\d,]{3,})|([\d,]{3,})\s*(?:₪|nis|ש"?ח|שקל)/i,
  )
  if (cur) {
    const v = parseInt((cur[1] ?? cur[2]).replace(/,/g, ''), 10)
    if (v > 500 && v < 50_000_000) return v
  }
  return undefined
}

function parseRooms(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d)?)\s*(?:bed(?:room)?s?|rooms?|חדר(?:ים)?)/i)
  if (m) {
    const r = parseFloat(m[1])
    if (r >= 1 && r <= 20) return r
  }
  return undefined
}

function parseSize(text: string): number | undefined {
  const m = text.match(/(\d{2,4})\s*(?:m²|sqm|sq\.?\s?m|מ["״']?ר|מ['׳]|מטר)/i)
  if (m) {
    const s = parseFloat(m[1])
    if (s >= 10 && s <= 5000) return s
  }
  return undefined
}

/** rent vs sale from explicit keywords; undefined if the post doesn't say. */
function parseDeal(text: string): 'forsale' | 'rent' | undefined {
  if (/(?:להשכרה|לשכירות|השכרה|for\s*rent|to\s*rent|for\s*lease)/i.test(text)) return 'rent'
  if (/(?:למכירה|מכירה|for\s*sale)/i.test(text)) return 'forsale'
  return undefined
}

/** Israeli mobile/landline, incl +972. */
function parsePhone(text: string): string | undefined {
  const m = text.match(
    /(\+972[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}|0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/,
  )
  return m ? m[1].trim() : undefined
}

// City list is built once from the canonical Hebrew keys, longest first so
// "תל אביב יפו" wins over "תל אביב" when both would match.
const CITY_KEYS = Object.keys(CITY_TRANSLATIONS).sort((a, b) => b.length - a.length)

function parseCity(text: string): string | undefined {
  for (const key of CITY_KEYS) {
    if (key.length >= 3 && text.includes(key)) return key
  }
  return undefined
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseListingText(raw: string): ParseResult {
  const text = (raw || '').trim()
  const fields: ParsedListing = {}
  const filled: (keyof ParsedListing)[] = []
  if (text.length < 3) return { fields, filled }

  const price = parsePrice(text)
  if (price != null) { fields.price = String(price); filled.push('price') }

  const rooms = parseRooms(text)
  if (rooms != null) { fields.rooms = String(rooms); filled.push('rooms') }

  const size = parseSize(text)
  if (size != null) { fields.size_m2 = String(size); filled.push('size_m2') }

  const city = parseCity(text)
  if (city) { fields.city = city; filled.push('city') }

  const deal = parseDeal(text)
  if (deal) { fields.deal_type = deal; filled.push('deal_type') }

  const phone = parsePhone(text)
  if (phone) { fields.contact_phone = phone; filled.push('contact_phone') }

  // Always carry the pasted text over as the description (trimmed).
  fields.description = text.slice(0, 1200)
  filled.push('description')

  return { fields, filled }
}
