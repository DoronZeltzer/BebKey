/**
 * BebKey Logo System
 * ────────────────────────────────────────────────────────────────────────────
 * Implements the design from "Bebkey Logo.html" (claude.ai design system).
 *
 *   Palette
 *     #1E40AF - brand blue
 *     #F59E0B - gold/orange accent
 *     #FAFAF8 - paper
 *     #0E1326 - ink
 *
 *   Components
 *     <BkMonogram />  → just the b/k mark (square)
 *     <Logo />        → horizontal lockup: monogram + "bebkey" wordmark
 *
 *   Both accept a `variant` prop that picks one of:
 *     brand   - full-color, intended for brand-blue / dark backgrounds
 *     paper   - full-color, intended for white / light backgrounds (adds ink
 *               outline so the white "b" doesn't disappear into the page)
 *     gold    - full-color, intended for the gold accent background
 *     ink     - monochrome ink, single solid color
 *     paperMono - monochrome paper (single solid white)
 *
 *   Pass `className` for sizing - the SVGs scale with width/height utility
 *   classes.  Default sizes work in a 56-px nav row.
 */

export const BEBKEY_COLORS = {
  blue:   '#1E40AF',
  gold:   '#F59E0B',
  paper:  '#FAFAF8',
  ink:    '#0E1326',
} as const

type Variant = 'brand' | 'paper' | 'gold' | 'ink' | 'paperMono'

interface ColorScheme {
  stem:        string  // "b" stem + bowl color
  accent:      string  // orange "k" triangle color
  wordmarkBeb: string  // "beb" portion
  wordmarkKey: string  // "key" portion
  outline?:    string  // optional 0.5px outline for the "b" so it doesn't
                       // vanish into a light background - applies to the
                       // full-color paper variant only.
}

const SCHEMES: Record<Variant, ColorScheme> = {
  brand: {
    stem:        BEBKEY_COLORS.paper,
    accent:      BEBKEY_COLORS.gold,
    wordmarkBeb: BEBKEY_COLORS.paper,
    wordmarkKey: BEBKEY_COLORS.gold,
  },
  paper: {
    stem:        BEBKEY_COLORS.paper,
    accent:      BEBKEY_COLORS.gold,
    wordmarkBeb: BEBKEY_COLORS.ink,
    wordmarkKey: BEBKEY_COLORS.gold,
    outline:     BEBKEY_COLORS.ink,
  },
  gold: {
    stem:        BEBKEY_COLORS.ink,
    accent:      BEBKEY_COLORS.ink,
    wordmarkBeb: BEBKEY_COLORS.ink,
    wordmarkKey: BEBKEY_COLORS.ink,
  },
  ink: {
    stem:        BEBKEY_COLORS.ink,
    accent:      BEBKEY_COLORS.ink,
    wordmarkBeb: BEBKEY_COLORS.ink,
    wordmarkKey: BEBKEY_COLORS.ink,
  },
  paperMono: {
    stem:        BEBKEY_COLORS.paper,
    accent:      BEBKEY_COLORS.paper,
    wordmarkBeb: BEBKEY_COLORS.paper,
    wordmarkKey: BEBKEY_COLORS.paper,
  },
}

// ── Monogram (the b/k mark) ────────────────────────────────────────────────
// Renders the official bk logo art (public/logo-mark*.png). The color mark
// (white "b" + orange "k") is used on brand/dark backgrounds; the ink mark on
// light/gold ones. Regenerate the art via scripts/render_icons.py.
const MARK_SRC: Record<Variant, string> = {
  brand:     '/logo-mark.png?v=6',      // white b + orange k → dark / brand bg
  paperMono: '/logo-mark.png?v=6',
  paper:     '/logo-mark-ink.png?v=6',  // dark ink mark → light / paper bg
  ink:       '/logo-mark-ink.png?v=6',
  gold:      '/logo-mark-ink.png?v=6',  // dark ink mark → gold bg
}

export function BkMonogram({
  variant = 'brand',
  className = 'h-10 w-10',
  ariaLabel = 'BebKey',
}: {
  variant?: Variant
  className?: string
  ariaLabel?: string
}) {
  return (
    <img
      src={MARK_SRC[variant]}
      alt={ariaLabel}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}

// ── Full lockup: monogram + "bebkey" wordmark, side by side ────────────────
export function Logo({
  variant = 'brand',
  className = 'h-9',
  ariaLabel = 'BebKey',
}: {
  variant?: Variant
  className?: string
  ariaLabel?: string
}) {
  const s = SCHEMES[variant]
  return (
    // dir="ltr" pins the lockup left-to-right: "BebKey" is a brand name and must
    // never reverse to "keyBeb" under the app's RTL (Hebrew/Arabic) direction,
    // and it keeps the monogram on the left of the wordmark in every language.
    <span dir="ltr" className={`inline-flex items-center gap-2 ${className}`} aria-label={ariaLabel}>
      <BkMonogram variant={variant} className="h-full w-auto" ariaLabel="" />
      <span
        className="font-bold tracking-tight text-[1.35em] leading-none"
        // The wordmark uses the same weight/cadence as Inter Bold which is
        // already loaded by Tailwind's default font stack.
      >
        <span style={{ color: s.wordmarkBeb }}>beb</span>
        <span style={{ color: s.wordmarkKey }}>key</span>
      </span>
    </span>
  )
}

export default Logo
