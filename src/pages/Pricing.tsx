import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useEffect } from 'react'
import { useSeo } from '../hooks/useSeo'
import { trackEvent } from '../components/GoogleAnalytics'
import { LISTING_LIMITS } from '../lib/listingLimits'

// Lemon Squeezy variant IDs are read from Vite env vars at build time.  They
// ship in the client bundle (that's what VITE_ means) and the server
// /api/ls-checkout endpoint has its own allow-list check to ensure only these
// three are accepted.  To rotate: change in Vercel env vars + redeploy.
const VARIANT_STARTER = import.meta.env.VITE_LS_VARIANT_STARTER as string | undefined
const VARIANT_PRO     = import.meta.env.VITE_LS_VARIANT_PRO     as string | undefined
const VARIANT_AGENCY  = import.meta.env.VITE_LS_VARIANT_AGENCY  as string | undefined
const VARIANT_OFFICE  = import.meta.env.VITE_LS_VARIANT_OFFICE  as string | undefined

// Grow (Meshulam) hosted payment-page URLs, one per plan. Present => that plan's
// Subscribe button starts a Grow checkout via /api/grow-checkout; absent => the
// button falls back to a contact email. Set these in Vercel env + redeploy.
const GROW_PAGE: Record<string, string | undefined> = {
  starter: import.meta.env.VITE_GROW_PAGE_STARTER as string | undefined,
  pro:     import.meta.env.VITE_GROW_PAGE_PRO     as string | undefined,
  agency:  import.meta.env.VITE_GROW_PAGE_AGENCY  as string | undefined,
  office:  import.meta.env.VITE_GROW_PAGE_OFFICE  as string | undefined,
}

type Plan = {
  key:          'free' | 'starter' | 'pro' | 'agency' | 'office'
  price:        string
  priceNum:     number
  listings:     number | null    // null = unlimited
  trial:        number | null    // days, null = no trial
  variantId:    string | undefined
  featuresKeys: string[]         // i18n keys for each bullet
  popular?:     boolean
  freeForever?: boolean
}

// Listing caps are sourced from src/lib/listingLimits.ts so Submit.tsx
// + ls-webhook + Pricing all agree on the exact numbers.  If you
// want to change a cap, change it in listingLimits.ts ONLY.
const PLANS: Plan[] = [
  {
    key:      'free',
    price:    '0',
    priceNum: 0,
    listings: LISTING_LIMITS.free,
    trial:    null,
    variantId: undefined,
    freeForever: true,
    featuresKeys: [
      'pricing.features.freeListings',
      'pricing.features.basicVisibility',
      'pricing.features.buyerInquiriesEmail',
      'pricing.features.savedSearches',
    ],
  },
  {
    key:      'starter',
    price:    '100',
    priceNum: 100,
    listings: LISTING_LIMITS.starter,
    trial:    null,
    variantId: VARIANT_STARTER,
    featuresKeys: [
      'pricing.features.starterListings',
      'pricing.features.agentDashboard',
      'pricing.features.emailAlerts',
      'pricing.features.whatsappLeads',
      'pricing.features.basicAnalytics',
    ],
  },
  {
    key:      'pro',
    price:    '200',
    priceNum: 200,
    listings: LISTING_LIMITS.pro,
    trial:    null,
    variantId: VARIANT_PRO,
    popular:  true,
    featuresKeys: [
      'pricing.features.proListings',
      'pricing.features.priorityAlerts',
      'pricing.features.advancedAnalytics',
      'pricing.features.advancedFilters',
      'pricing.features.whatsappIntegration',
      'pricing.features.clientImport',
    ],
  },
  {
    key:      'agency',
    price:    '400',
    priceNum: 400,
    listings: null,
    trial:    null,
    variantId: VARIANT_AGENCY,
    featuresKeys: [
      'pricing.features.unlimitedListings',
      'pricing.features.teamAccounts',
      'pricing.features.apiAccess',
      'pricing.features.whiteLabel',
      'pricing.features.dedicatedSupport',
      'pricing.features.everythingInPro',
    ],
  },
  {
    key:      'office',
    price:    '700',
    priceNum: 700,
    listings: null,
    trial:    null,
    // Set VITE_LS_VARIANT_OFFICE once the Office product exists in Lemon Squeezy;
    // until then the CTA falls back to a contact email (handleCta).
    variantId: VARIANT_OFFICE,
    featuresKeys: [
      'pricing.features.everythingInAgency',
      'pricing.features.officeProfile',
      'pricing.features.teamSeats',
      'pricing.features.leadCrm',
      'pricing.features.bulkTools',
      'pricing.features.prioritySupport',
    ],
  },
]

// Version tag - bumped to force a fresh build when env vars change.
// (Vercel's build cache otherwise reuses the previous minified output and
// the new VITE_LS_VARIANT_* values from project settings never get baked in.)
const PRICING_BUILD_REV = 'v2-2026-06-10-tiers' as const
void PRICING_BUILD_REV   // keep the literal in the minified bundle

export default function Pricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  useSeo({
    title: t('pricing.seoTitle'),
    description: t('pricing.seoDescription'),
    url: 'https://www.bebkey.com/pricing',
  })

  // Service + Offer JSON-LD.  When Google's shopping/service snippets
  // trigger for queries like "BebKey pricing" or "how much does BebKey
  // cost", this lets the SERP render the tier list with prices directly.
  // AI answer engines (Perplexity/ChatGPT) also parse Service.offers to
  // answer pricing questions accurately, so users get the right number
  // even when they don't click through.
  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'Service',
      name:       'BebKey — Israeli real-estate listing & agent platform',
      provider: {
        '@type': 'Organization',
        name:    'BebKey',
        url:     'https://www.bebkey.com',
      },
      areaServed:      { '@type': 'Country', name: 'Israel' },
      serviceType:     'Real estate listing aggregation and agent subscription',
      offers: PLANS.filter(p => p.priceNum > 0).map(p => ({
        '@type':          'Offer',
        name:             `BebKey ${p.key.charAt(0).toUpperCase() + p.key.slice(1)}`,
        price:            p.priceNum,
        priceCurrency:    'ILS',
        priceSpecification: {
          '@type':          'UnitPriceSpecification',
          price:            p.priceNum,
          priceCurrency:    'ILS',
          unitCode:         'MON',
          billingIncrement: 1,
          referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
        },
        eligibleRegion:   { '@type': 'Country', name: 'Israel' },
        availability:     'https://schema.org/InStock',
        url:              'https://www.bebkey.com/pricing',
      })),
    }
    let el = document.getElementById('pricing-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'pricing-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [])

  async function handleCta(plan: Plan) {
    // Free tier - just sign up and start posting
    if (plan.key === 'free') {
      navigate(user ? '/submit' : '/register')
      return
    }

    if (!user) {
      navigate('/register')
      return
    }

    // No Grow payment page configured yet for this plan - fall back to contact
    if (!GROW_PAGE[plan.key]) {
      window.open(
        `mailto:support@bebkey.com?subject=${encodeURIComponent(`${plan.key} plan`)}&body=${encodeURIComponent(`Hi,\n\nI'd like the ${plan.key} plan (₪${plan.price}/mo).\n\nEmail: ${user.email}\n`)}`,
        '_blank',
      )
      return
    }

    // GA4 begin_checkout - fires when user clicks the Subscribe button.
    // The purchase event fires from the /checkout/success page after Grow
    // redirects the user back post-payment.
    trackEvent('begin_checkout', {
      currency:  'ILS',
      value:     plan.priceNum,
      items:     [{
        item_id:       plan.key,
        item_name:     `BebKey ${plan.key}`,
        item_category: 'subscription',
        price:         plan.priceNum,
        quantity:      1,
      }],
    })

    // Ask the server for the Grow hosted payment-page URL (email prefilled +
    // user id attached), then redirect there. Grow's webhook activates the plan.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      navigate('/login')
      return
    }
    const res = await fetch('/api/grow-checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ plan: plan.key }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body?.url) {
      alert(body?.error || 'Could not start checkout. Please try again.')
      return
    }
    window.location.href = body.url
  }

  const ctaLabel = (plan: Plan): string => {
    if (plan.key === 'free') return t('pricing.cta.startFree')
    return t('pricing.cta.subscribe')
  }

  // Tier accent colors
  const tierStyle = (plan: Plan) => {
    if (plan.freeForever) {
      return {
        border: 'border-gray-200',
        button: 'bg-gray-900 text-white hover:bg-gray-800',
        price:  'text-gray-900',
      }
    }
    if (plan.popular) {
      return {
        border: 'border-brand-orange ring-2 ring-brand-orange/20 shadow-lg scale-[1.02]',
        button: 'bg-brand-orange text-gray-900 hover:bg-orange-500',
        price:  'text-brand-orange',
      }
    }
    if (plan.key === 'agency') {
      return {
        border: 'border-purple-300 shadow-sm',
        button: 'bg-purple-600 text-white hover:bg-purple-700',
        price:  'text-purple-600',
      }
    }
    if (plan.key === 'office') {
      return {
        border: 'border-gray-800 shadow-md',
        button: 'bg-gray-900 text-white hover:bg-black',
        price:  'text-gray-900',
      }
    }
    return {
      border: 'border-gray-200 hover:border-brand-blue/40 transition-colors',
      button: 'bg-brand-blue text-white hover:bg-blue-700',
      price:  'text-brand-blue',
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          {t('pricing.title')}
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto text-sm sm:text-base">
          {t('pricing.subtitle')}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
        {PLANS.map(plan => {
          const style = tierStyle(plan)
          return (
            <div
              key={plan.key}
              className={`relative rounded-2xl border-2 p-5 flex flex-col gap-3 bg-white ${style.border}`}
            >
              {plan.popular && (
                <span className="absolute -top-3 start-1/2 -translate-x-1/2 bg-brand-orange text-gray-900 text-[11px] px-3 py-1 rounded-full font-bold whitespace-nowrap uppercase tracking-wider">
                  {t('pricing.mostPopular')}
                </span>
              )}
              {plan.freeForever && (
                <span className="absolute -top-3 start-1/2 -translate-x-1/2 bg-gray-900 text-white text-[11px] px-3 py-1 rounded-full font-bold whitespace-nowrap uppercase tracking-wider">
                  {t('pricing.freeForever')}
                </span>
              )}

              <h2 className="text-xl font-bold text-gray-900 mt-1">
                {t(`pricing.${plan.key}`)}
              </h2>

              <div>
                <p className={`text-3xl font-extrabold tracking-tight ${style.price}`}>
                  ₪{plan.price}
                  <span className="text-sm text-gray-400 font-normal">
                    {' '}{t('pricing.month')}
                  </span>
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {plan.listings === null
                    ? t('pricing.unlimited')
                    : plan.listings === 1
                    ? t('pricing.oneListing')
                    : t('pricing.listingsCount', { count: plan.listings })}
                </p>
              </div>

              <ul className="flex flex-col gap-2 text-sm text-gray-600 flex-1">
                {plan.featuresKeys.map(fk => (
                  <li key={fk} className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{t(fk)}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCta(plan)}
                className={`mt-auto py-3 rounded-xl font-semibold transition-colors text-sm ${style.button}`}
              >
                {ctaLabel(plan)}
              </button>
            </div>
          )
        })}
      </div>

      {/* Secure-payment note (Stripe) */}
      <p className="text-center text-xs text-gray-400 mt-6 flex items-center justify-center gap-1.5">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        {t('pricing.securePayment')}
      </p>

      {/* Trust block */}
      <div className="mt-10 grid md:grid-cols-3 gap-6 text-center">
        {[
          { icon: '🔒', titleKey: 'pricing.trust.secureTitle',  textKey: 'pricing.trust.secureText'  },
          { icon: '⚡', titleKey: 'pricing.trust.instantTitle', textKey: 'pricing.trust.instantText' },
          { icon: '📊', titleKey: 'pricing.trust.analyticsTitle', textKey: 'pricing.trust.analyticsText' },
        ].map(item => (
          <div key={item.titleKey} className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-3xl mb-2">{item.icon}</p>
            <p className="font-semibold text-gray-800 text-sm">{t(item.titleKey)}</p>
            <p className="text-xs text-gray-500 mt-1">{t(item.textKey)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
