/**
 * Per-plan active-listing caps for BebKey.
 *
 * Single source of truth: src/pages/Pricing.tsx, api/ls-webhook.ts, and this
 * file MUST all agree.  Whenever you change a number here, change it in the
 * other two files as well - or extract them to a JSON / DB row that all three read.
 *
 * Free tier is enforced at the application layer; paid tiers are also
 * enforced server-side by the ls-webhook lock/unlock mechanism.
 */
export type PlanKey = 'free' | 'starter' | 'pro' | 'agency' | 'office'

export const LISTING_LIMITS: Record<PlanKey, number> = {
  free:    5,
  starter: 10,
  pro:     30,
  agency:  Infinity,
  office:  Infinity,
}

/** Human-readable limit label, e.g. "5 listings", "Unlimited". */
export function limitLabel(plan: PlanKey, lang: 'he' | 'en' | 'ru' | 'ar' | 'fr' = 'en'): string {
  const n = LISTING_LIMITS[plan]
  if (n === Infinity) {
    return lang === 'he' ? 'ללא הגבלה' : 'Unlimited'
  }
  if (lang === 'he') return `${n} מודעות`
  return `${n} listings`
}

/** Look up the limit for a user-subscriptions.plan string (with legacy fallbacks). */
export function limitForPlan(plan: string | null | undefined): number {
  if (!plan) return LISTING_LIMITS.free
  const normalized = plan.toLowerCase()
  if (normalized in LISTING_LIMITS) return LISTING_LIMITS[normalized as PlanKey]
  // Legacy plan names from pre-2026-06 pricing
  if (normalized === 'basic')  return LISTING_LIMITS.starter
  if (normalized === 'single') return 1
  return LISTING_LIMITS.free
}
