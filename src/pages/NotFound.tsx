import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

/**
 * NotFound - 404 page.  Goes beyond a static "page not found": gives the
 * user a search box and four popular destination chips so they have a real
 * way to recover instead of bouncing.
 */
export default function NotFound() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  useSeo({
    title: t('notFound.title') || 'Page not found',
    description:
      t('notFound.description') ||
      "Sorry, the page you were looking for couldn't be found on BebKey.",
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (trimmed) navigate(`/search?keyword=${encodeURIComponent(trimmed)}`)
    else navigate('/search')
  }

  const popular = [
    { href: '/search?dealType=rent',                     label: t('home.forRent')    || 'For Rent' },
    { href: '/search?dealType=forsale',                  label: t('home.forSale')    || 'For Sale' },
    { href: '/insights',                                 label: t('nav.insights')    || 'Insights' },
    { href: '/help',                                     label: t('common.help')     || 'Help' },
  ]

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-lg w-full">
        <p className="text-8xl font-extrabold text-brand-blue/20 mb-4 select-none">404</p>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {t('notFound.title') || 'Page not found'}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {t('notFound.description') ||
            "The page you're looking for doesn't exist or has been moved."}
        </p>

        {/* Recovery search - most users want to find a listing, not a page */}
        <form onSubmit={onSubmit} className="flex gap-2 mb-6">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.keywordPlaceholder') || 'Search listings...'}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            aria-label={t('search.keywordPlaceholder') || 'Search'}
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {t('nav.search') || 'Search'}
          </button>
        </form>

        {/* Popular destinations */}
        <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
          {t('notFound.popular') || 'Popular pages'}
        </p>
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {popular.map((p) => (
            <Link
              key={p.href}
              to={p.href}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
            >
              {p.label}
            </Link>
          ))}
        </div>

        <Link
          to="/"
          className="inline-block text-sm text-brand-blue hover:underline"
        >
          {t('notFound.goHome') || '← Go home'}
        </Link>
      </div>
    </div>
  )
}
