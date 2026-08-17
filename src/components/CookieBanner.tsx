import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'bebkey_cookie_consent'

interface ConsentState {
  decided:    boolean   // user has made a choice (banner stays hidden)
  functional: boolean   // language preference etc.
  analytics:  boolean   // Vercel Analytics + Speed Insights
}

const EMPTY: ConsentState = { decided: false, functional: false, analytics: false }

function loadConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

function saveConsent(state: ConsentState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  // Notify any subscriber (App, etc.) that consent changed so analytics
  // components can re-evaluate without a full page reload.
  window.dispatchEvent(new CustomEvent('bebkey-consent-changed', { detail: state }))
}

export default function CookieBanner() {
  const { t } = useTranslation()
  const [visible, setVisible]         = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [functional, setFunctional]   = useState(false)
  const [analytics, setAnalytics]     = useState(false)

  useEffect(() => {
    const existing = loadConsent()
    if (!existing.decided) {
      setVisible(true)
    }
    // Also listen for an external "open cookie preferences" event so a
    // footer link can re-open this banner whenever the user wants.
    function onOpen() { setVisible(true); setShowDetails(true) }
    window.addEventListener('bebkey-open-cookie-prefs', onOpen)
    return () => window.removeEventListener('bebkey-open-cookie-prefs', onOpen)
  }, [])

  function acceptAll() {
    saveConsent({ decided: true, functional: true, analytics: true })
    setVisible(false)
  }

  function acceptEssentialOnly() {
    saveConsent({ decided: true, functional: false, analytics: false })
    setVisible(false)
  }

  function saveCustom() {
    saveConsent({ decided: true, functional, analytics })
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('cookieBanner.title')}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl"
    >
      <div className="max-w-5xl mx-auto px-4 py-5">
        {!showDetails ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900 mb-1">{t('cookieBanner.heading')}</p>
              <p className="text-xs leading-relaxed text-gray-600">
                {t('cookieBanner.intro')}{' '}
                <a href="/privacy" className="text-brand-blue underline hover:opacity-80">
                  {t('cookieBanner.learnMore')}
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              <button onClick={() => setShowDetails(true)} className="px-4 py-2 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                {t('cookieBanner.managePreferences')}
              </button>
              <button onClick={acceptEssentialOnly} className="px-4 py-2 text-xs border border-gray-400 rounded-lg text-gray-800 font-medium hover:bg-gray-100 transition-colors">
                {t('cookieBanner.essentialOnly')}
              </button>
              <button onClick={acceptAll} className="px-4 py-2 text-xs bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                {t('cookieBanner.acceptAll')}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">{t('cookieBanner.title')}</h2>
              <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label={t('cookieBanner.closeDetails')}>✕</button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {t('cookieBanner.detailsIntro')}
            </p>

            {/* Essential - always on */}
            <CategoryRow
              title={t('cookieBanner.essentialTitle')}
              description={t('cookieBanner.essentialDesc')}
              example={t('cookieBanner.essentialExample')}
              alwaysOn
            />

            {/* Functional - opt-in */}
            <CategoryRow
              title={t('cookieBanner.functionalTitle')}
              description={t('cookieBanner.functionalDesc')}
              example={t('cookieBanner.functionalExample')}
              on={functional}
              onToggle={() => setFunctional(v => !v)}
            />

            {/* Analytics - opt-in */}
            <CategoryRow
              title={t('cookieBanner.analyticsTitle')}
              description={t('cookieBanner.analyticsDesc')}
              example={t('cookieBanner.analyticsExample')}
              on={analytics}
              onToggle={() => setAnalytics(v => !v)}
            />

            <div className="flex flex-wrap gap-2 mt-4 border-t border-gray-100 pt-4">
              <button onClick={acceptEssentialOnly} className="px-4 py-2 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                {t('cookieBanner.rejectAll')}
              </button>
              <button onClick={saveCustom} className="px-4 py-2 text-xs border border-gray-400 rounded-lg text-gray-800 font-medium hover:bg-gray-100 transition-colors">
                {t('cookieBanner.saveChoices')}
              </button>
              <button onClick={acceptAll} className="px-4 py-2 text-xs bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                {t('cookieBanner.acceptAll')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryRow({
  title, description, example, alwaysOn, on, onToggle,
}: {
  title: string
  description: string
  example: string
  alwaysOn?: boolean
  on?: boolean
  onToggle?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start justify-between py-3 border-t border-gray-100">
      <div className="flex-1 pr-4">
        <p className="font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        <p className="text-xs text-gray-400 mt-1">{t('cookieBanner.examplesLabel')} {example}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2 mt-1">
        {alwaysOn ? (
          <>
            <span className="text-xs text-gray-400 font-medium">{t('cookieBanner.alwaysActive')}</span>
            <div className="w-9 h-5 bg-brand-blue rounded-full relative cursor-not-allowed opacity-70">
              <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
            </div>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-400">{on ? t('cookieBanner.on') : t('cookieBanner.off')}</span>
            <button
              role="switch"
              aria-checked={on ?? false}
              onClick={onToggle}
              className={`w-9 h-5 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1 ${on ? 'bg-brand-blue' : 'bg-gray-300'}`}
              aria-label={t('cookieBanner.toggleLabel', { name: title })}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Hook - lets other components read the saved consent and react to changes. */
export function useCookieConsent(): ConsentState {
  const [state, setState] = useState<ConsentState>(() => loadConsent())
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<ConsentState>).detail
      if (detail) setState(detail)
      else setState(loadConsent())
    }
    window.addEventListener('bebkey-consent-changed', onChange)
    return () => window.removeEventListener('bebkey-consent-changed', onChange)
  }, [])
  return state
}

/** Programmatic API for opening the banner - e.g. from a footer link. */
export function openCookiePreferences() {
  window.dispatchEvent(new Event('bebkey-open-cookie-prefs'))
}
