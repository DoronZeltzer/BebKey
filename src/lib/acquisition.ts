/**
 * First-touch acquisition capture — "where did this visitor come from".
 *
 * captureFirstTouch() runs once per browser (first visit): it reads the UTM
 * params + document.referrer and stores a normalized source in localStorage.
 * On signup, Register.tsx reads getFirstTouch() and writes it to the
 * `acquisitions` table, so the admin dashboard can show signups by source and
 * (with ad_spend) cost-per-signup. No PII is stored — just a source label.
 */
const KEY = 'bebkey_first_touch'

export interface FirstTouch {
  source: string
  medium: string
  campaign: string | null
  referrer: string | null
  landing_path: string
  ts: number
}

export function captureFirstTouch(): void {
  try {
    if (localStorage.getItem(KEY)) return // first-touch only — don't overwrite
    const p = new URLSearchParams(window.location.search)
    const ref = document.referrer || ''
    let refHost = ''
    try { refHost = ref ? new URL(ref).hostname.replace(/^www\./, '') : '' } catch { /* ignore */ }

    const gclid = p.get('gclid')
    const fbclid = p.get('fbclid')
    const utmSource = p.get('utm_source')

    // Source: explicit utm_source wins; else infer from referrer / click ids;
    // else "direct".
    let source = utmSource || ''
    if (!source) {
      if (gclid || /google\./.test(refHost)) source = 'google'
      else if (fbclid || /facebook\.|fb\.com|fb\.me/.test(refHost)) source = 'facebook'
      else if (/instagram\./.test(refHost) || /ig\./.test(refHost)) source = 'instagram'
      else if (/(^|\.)t\.co$|twitter\.|x\.com/.test(refHost)) source = 'twitter'
      else if (/tiktok\./.test(refHost)) source = 'tiktok'
      else if (/bing\./.test(refHost)) source = 'bing'
      else if (refHost) source = refHost
      else source = 'direct'
    }

    const medium =
      p.get('utm_medium') ||
      (gclid || fbclid ? 'cpc' : refHost ? 'referral' : 'direct')

    const ft: FirstTouch = {
      source,
      medium,
      campaign: p.get('utm_campaign'),
      referrer: refHost || null,
      landing_path: window.location.pathname || '/',
      ts: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(ft))
  } catch { /* ignore (private mode / no storage) */ }
}

export function getFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FirstTouch) : null
  } catch {
    return null
  }
}
