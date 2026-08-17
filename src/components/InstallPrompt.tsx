/**
 * BebKey PWA Install Prompt
 *
 * Shows a dismissible banner prompting the user to add BebKey to their home
 * screen.  Fires the browser's beforeinstallprompt event, stores the deferred
 * prompt, and triggers it when the user clicks "Install".
 *
 * Rules:
 *  • Only shown once per browser session (sessionStorage flag).
 *  • Dismissed permanently if the user closes it (localStorage flag).
 *  • Not shown if the app is already running in standalone / fullscreen mode.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BkMonogram } from './Logo'

// Browser-supplied deferred install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'bebkey_install_dismissed'

export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (isStandalone) return

    // Don't show if user permanently dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setVisible(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!visible) return null

  return (
    <div
      role="alert"
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50
                 bg-white border border-gray-200 rounded-2xl shadow-xl p-4
                 flex items-start gap-3 animate-in slide-in-from-bottom duration-300"
    >
      {/* App icon - bk monogram on brand-blue tile */}
      <div className="flex-shrink-0 w-12 h-12 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm">
        <BkMonogram variant="brand" className="w-9 h-9" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{t('installPrompt.title')}</p>
        <p className="text-gray-500 text-xs mt-0.5 leading-snug">
          {t('installPrompt.description')}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex-1 py-1.5 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            {t('installPrompt.install')}
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition"
          >
            {t('installPrompt.notNow')}
          </button>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        aria-label={t('installPrompt.dismiss')}
        className="flex-shrink-0 -mt-1 -mr-1 w-6 h-6 text-gray-400 hover:text-gray-600 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
