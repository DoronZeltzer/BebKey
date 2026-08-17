/**
 * Cross-posting helpers for a freshly-published BebKey listing.
 *
 * Honest scope: neither Facebook Marketplace nor Yad2 exposes an API to CREATE
 * a listing, so we can't auto-publish there.  What we can do — legally and
 * without touching the user's credentials — is:
 *   • Facebook: open the official Share dialog pre-loaded with the listing URL
 *     (posts a link + preview to the user's own timeline in one tap).
 *   • Yad2: copy a ready-formatted listing block to the clipboard and open
 *     Yad2's post-an-ad page so the user pastes it into the ad form.
 */

export interface CrosspostData {
  deal_type: 'forsale' | 'rent'
  property_type?: string
  city?: string
  street?: string
  neighborhood?: string
  price?: string
  rooms?: string
  size_m2?: string
  floor?: string
  description?: string
  contact_phone?: string
}

/** Facebook's official share dialog — shares a link (with preview) to the
 *  user's timeline. The only compliant way to "post to Facebook" from a web app. */
export function facebookShareUrl(listingUrl: string): string {
  return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(listingUrl)
}

/** Yad2 real-estate section (post-an-ad lives behind "פרסום מודעה" here). */
export const YAD2_POST_URL = 'https://www.yad2.co.il/realestate'

/** A Hebrew-first, ready-to-paste listing block (Yad2 + FB are Hebrew-primary). */
export function buildListingText(d: CrosspostData, listingUrl: string): string {
  const deal = d.deal_type === 'rent' ? 'להשכרה' : 'למכירה'
  const head = [d.property_type, d.city ? `ב${d.city}` : null].filter(Boolean).join(' ')
  const lines: string[] = [[head, deal].filter(Boolean).join(' ').trim() || deal]

  const loc = [d.street, d.neighborhood].filter(Boolean).join(', ')
  if (loc) lines.push(loc)
  if (d.price) lines.push(`מחיר: ₪${Number(d.price).toLocaleString()}`)

  const specs = [
    d.rooms ? `${d.rooms} חדרים` : null,
    d.size_m2 ? `${d.size_m2} מ"ר` : null,
    d.floor ? `קומה ${d.floor}` : null,
  ].filter(Boolean).join(' · ')
  if (specs) lines.push(specs)

  if (d.description) lines.push('', d.description.trim())
  if (d.contact_phone) lines.push('', `טלפון: ${d.contact_phone}`)
  lines.push('', listingUrl)
  return lines.join('\n')
}
