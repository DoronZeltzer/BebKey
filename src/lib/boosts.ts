/**
 * Listing boosts — paid, one-time promotions on a single listing.
 *
 * Each boost drives a `*_until` timestamp column on the listing; display code
 * shows the boost while that column is in the future. Prices are the
 * "competitive" tier (margin is ~100% — a boost is just a flag).
 */
export type BoostType = 'bump' | 'featured' | 'spotlight' | 'tag'

export interface BoostOption {
  type: BoostType
  icon: string
  nameEn: string
  nameHe: string
  descEn: string
  descHe: string
  price: number   // ILS, one-time
  days: number
  /** the listings column this boost sets to now()+days */
  column: 'bump_until' | 'featured_until' | 'spotlight_until' | 'tag_until'
}

export const BOOSTS: Record<BoostType, BoostOption> = {
  bump: {
    type: 'bump', icon: '⤴️',
    nameEn: 'Bump to top', nameHe: 'קפיצה לראש',
    descEn: 'Re-floats your listing to the top of its city & category for the period.',
    descHe: 'מקפיץ את המודעה לראש העיר והקטגוריה לאורך התקופה.',
    price: 19, days: 7, column: 'bump_until',
  },
  featured: {
    type: 'featured', icon: '⭐',
    nameEn: 'Featured', nameHe: 'מודעה מובלטת',
    descEn: 'Gold badge, highlighted card, and sorted above all normal results.',
    descHe: 'תג זהב, כרטיס מודגש, ומיקום מעל כל התוצאות הרגילות.',
    price: 49, days: 14, column: 'featured_until',
  },
  spotlight: {
    type: 'spotlight', icon: '🏠',
    nameEn: 'Homepage spotlight', nameHe: 'ספוטלייט בעמוד הבית',
    descEn: 'Featured in the spotlight row on the BebKey home page.',
    descHe: 'מופיע בשורת הספוטלייט בעמוד הבית של BebKey.',
    price: 99, days: 7, column: 'spotlight_until',
  },
  tag: {
    type: 'tag', icon: '🔥',
    nameEn: 'Hot / price-drop tag', nameHe: 'תג חם / ירידת מחיר',
    descEn: 'A colored "Hot" or "Reduced" label on the card to catch the eye.',
    descHe: 'תווית צבעונית "חם" או "מחיר ירד" על הכרטיס שמושכת את העין.',
    price: 9, days: 7, column: 'tag_until',
  },
}

/** Display order: cheapest → premium. */
export const BOOST_LIST: BoostOption[] = [BOOSTS.bump, BOOSTS.tag, BOOSTS.featured, BOOSTS.spotlight]

export function boostName(b: BoostOption, lang: string): string {
  return lang === 'he' ? b.nameHe : b.nameEn
}
export function boostDesc(b: BoostOption, lang: string): string {
  return lang === 'he' ? b.descHe : b.descEn
}

/** Is a `*_until` timestamp string currently active (in the future)? */
export function isActive(until: string | null | undefined): boolean {
  return !!until && new Date(until).getTime() > Date.now()
}

// Lemon Squeezy one-time product variant IDs per boost (set in Vercel env).
// When a boost has no variant configured, the buy button falls back to a
// "payments coming soon" note.
const BOOST_VARIANTS: Record<BoostType, string | undefined> = {
  bump:      import.meta.env.VITE_LS_VARIANT_BOOST_BUMP      as string | undefined,
  featured:  import.meta.env.VITE_LS_VARIANT_BOOST_FEATURED  as string | undefined,
  spotlight: import.meta.env.VITE_LS_VARIANT_BOOST_SPOTLIGHT as string | undefined,
  tag:       import.meta.env.VITE_LS_VARIANT_BOOST_TAG       as string | undefined,
}

export function boostVariantId(type: BoostType): string | undefined {
  return BOOST_VARIANTS[type]
}

// Grow (Meshulam) hosted payment-page URLs per boost (set in Vercel env). When a
// boost has no page configured, the buy button falls back to a "coming soon"
// note. Checkout itself goes through /api/grow-checkout (kind:'boost').
// Build rev v1 (2026-07-13): keeps this module's chunk from being served stale
// from the build cache after the VITE_GROW_PAGE_BOOST_* env vars were added.
const BOOST_GROW_PAGES: Record<BoostType, string | undefined> = {
  bump:      import.meta.env.VITE_GROW_PAGE_BOOST_BUMP      as string | undefined,
  featured:  import.meta.env.VITE_GROW_PAGE_BOOST_FEATURED  as string | undefined,
  spotlight: import.meta.env.VITE_GROW_PAGE_BOOST_SPOTLIGHT as string | undefined,
  tag:       import.meta.env.VITE_GROW_PAGE_BOOST_TAG       as string | undefined,
}

export function boostGrowConfigured(type: BoostType): boolean {
  return !!BOOST_GROW_PAGES[type]
}
