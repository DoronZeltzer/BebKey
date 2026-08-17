/**
 * Google Analytics 4 — consent-gated SPA tracking.
 *
 * Only mounts when the user has opted into analytics via CookieBanner
 * (Israeli PPA + EU GDPR require explicit consent for any cross-page
 * tracking, even when the implementation is "cookieless").
 *
 * What it tracks:
 *   1. Page views on every React Router navigation (single-page apps don't
 *      fire the native gtag page_view automatically; we send one manually
 *      on every location change).
 *   2. The base GA4 enhanced-measurement events that gtag handles itself
 *      once loaded (scroll, outbound link, file download, site search).
 *   3. Custom conversion events for advertising:
 *        sign_up         — fired by Register flow (still TODO in Register.tsx)
 *        listing_view    — fired on ListingDetail mount (still TODO)
 *        save_listing    — fired by useSavedListings (still TODO)
 *        begin_checkout  — fired by Pricing.tsx when the LS checkout redirect starts
 *        purchase        — fired by /checkout/success after LS redirect (still TODO)
 *
 * For now this component just gets the gtag script onto the page and tracks
 * page views; the custom-event wiring lives in their respective components
 * and uses the trackEvent() helper exported below.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MEASUREMENT_ID = 'G-0B16BNNH9D'

// gtag's global signature on window
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let injected = false
function injectGtag() {
  if (injected) return
  injected = true

  // gtag boilerplate — exactly what Google's docs ship
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) { window.dataLayer!.push(args) }
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, {
    // We send page_view manually on route change (SPA), not on initial load
    send_page_view: false,
    // Don't anonymise IPs - Israel/EU privacy laws are satisfied by
    // requiring explicit consent (we already do that via CookieBanner)
    anonymize_ip: false,
  })

  // Async-load the actual gtag.js
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(script)
}

/**
 * Send a custom event to GA4.  Safe to call before consent is given
 * (becomes a no-op if gtag hasn't loaded yet).
 *
 * Standard GA4 conversion event names:
 *   - sign_up           (recommended)
 *   - login             (recommended)
 *   - search            (recommended)
 *   - view_item         (recommended; we map to listing_view)
 *   - add_to_wishlist   (recommended; we map to save_listing)
 *   - begin_checkout    (recommended)
 *   - purchase          (recommended; needs transaction_id + value + currency)
 *   - generate_lead     (recommended; for contact-form submits)
 */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (!window.gtag) return
  window.gtag('event', name, params || {})
}

export default function GoogleAnalytics() {
  const location = useLocation()

  // Inject the gtag script on first render (consent already verified by parent)
  useEffect(() => {
    injectGtag()
  }, [])

  // Send a page_view on every SPA route change
  useEffect(() => {
    if (!window.gtag) return
    const path = location.pathname + location.search
    window.gtag('event', 'page_view', {
      page_path:     path,
      page_location: window.location.href,
      page_title:    document.title,
    })
  }, [location.pathname, location.search])

  return null
}
