import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'

interface Section {
  id: string
  /** i18n key suffix under `help.sections.<this>` */
  key: 'pricing' | 'listProperty' | 'deleteAccount' | 'savedListings'
  /** Destination of the "Take me there" call-to-action button */
  ctaHref: string
  /** Inline SVG icon - kept lightweight, all from feather/lucide */
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'pricing',
    key: 'pricing',
    ctaHref: '/pricing',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8v8m0 0v2m0-10V6m0 16a10 10 0 100-20 10 10 0 000 20z" />
      </svg>
    ),
  },
  {
    id: 'list-property',
    key: 'listProperty',
    ctaHref: '/submit',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'delete-account',
    key: 'deleteAccount',
    ctaHref: '/profile',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
      </svg>
    ),
  },
  {
    id: 'saved-listings',
    key: 'savedListings',
    ctaHref: '/saved',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
]

export default function Help() {
  useSeo({
    title: 'Help & FAQ',
    description: 'Answers to common questions about searching, listings, saved searches, agent accounts, and payments on BebKey.',
  })
  const { t } = useTranslation()
  const { hash } = useLocation()

  // Inject FAQPage schema so Google can render this as a rich snippet in
  // search results (an expandable list of Q&A right on the SERP).  Same
  // structure is what Perplexity/ChatGPT parse when they cite pages.
  useEffect(() => {
    const id = 'help-faq-schema'
    const existing = document.getElementById(id)
    if (existing) existing.remove()
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = id
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: SECTIONS.map(s => ({
        '@type': 'Question',
        name: t(`help.sections.${s.key}.title`),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t(`help.sections.${s.key}.body`),
        },
      })),
    })
    document.head.appendChild(script)
    return () => {
      const el = document.getElementById(id)
      if (el) el.remove()
    }
    // t is stable across renders under our i18n setup; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Honor the hash on initial mount + when hash changes.  The shared
  // ScrollToTop component only fires on pathname changes, so it doesn't
  // interfere here.  Smooth-scroll on hash change makes the
  // /contact → /help#section deep-link feel intentional.
  useEffect(() => {
    if (!hash) return
    const id = hash.replace(/^#/, '')
    // Defer so React has mounted the target element
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [hash])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">
            {t('help.pageTitle')}
          </h1>
          <p className="text-gray-500">{t('help.pageSubtitle')}</p>
        </div>

        {/* Table of contents - sticky on tall screens for easy nav */}
        <nav
          className="bg-white rounded-2xl shadow-md p-4 mb-8 flex flex-wrap gap-2 justify-center"
          aria-label={t('help.tocLabel')}
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm text-brand-blue hover:underline px-3 py-1 rounded-lg
                         hover:bg-brand-blue/10 transition-colors"
            >
              {t(`help.sections.${s.key}.title`)}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <div className="flex flex-col gap-6">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="bg-white rounded-2xl shadow-md p-6 sm:p-8 scroll-mt-24"
            >
              <div className="flex items-start gap-4 mb-3">
                <div className="w-12 h-12 bg-brand-blue/10 text-brand-blue rounded-xl
                                flex items-center justify-center flex-shrink-0">
                  {s.icon}
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mt-1.5">
                  {t(`help.sections.${s.key}.title`)}
                </h2>
              </div>

              <p className="text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
                {t(`help.sections.${s.key}.body`)}
              </p>

              <Link
                to={s.ctaHref}
                className="inline-flex items-center gap-1 text-brand-blue font-medium
                           hover:underline text-sm"
              >
                {t(`help.sections.${s.key}.cta`)} →
              </Link>
            </section>
          ))}
        </div>

        {/* Still stuck? Contact CTA */}
        <div className="mt-10 bg-brand-blue/5 border border-brand-blue/20 rounded-2xl p-6 text-center">
          <h3 className="font-semibold text-gray-800 mb-1">{t('help.stillStuck.title')}</h3>
          <p className="text-gray-500 text-sm mb-4">{t('help.stillStuck.body')}</p>
          <Link
            to="/contact"
            className="inline-block bg-brand-blue text-white px-6 py-2.5 rounded-lg
                       font-semibold hover:bg-blue-700 transition-colors text-sm"
          >
            {t('help.stillStuck.cta')}
          </Link>
        </div>
      </div>
    </div>
  )
}
