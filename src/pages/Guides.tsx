/**
 * Guides - knowledge-base index page.
 *
 * /guides lists every long-form article we publish on Israeli real estate
 * (mortgage, tabu, tama 38, arnona, olim benefits, etc).  These are
 * informational-intent SEO content - people search "tama 38 explained" or
 * "Israeli mortgage" and land on bebkey.com, then convert to buyers/renters
 * after reading.
 *
 * Content lives in /public/guides/ as markdown files; index is
 * /public/guides/index.json.  Add a new guide by:
 *   1. Drop the markdown into public/guides/<slug>.md (+ .he.md for Hebrew)
 *   2. Add an entry to public/guides/index.json
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

interface Guide {
  slug:        string
  title:       string
  titleHe?:    string
  titleRu?:    string
  titleAr?:    string
  titleFr?:    string
  excerpt:     string
  excerptHe?:  string
  excerptRu?:  string
  excerptAr?:  string
  excerptFr?:  string
  category:    string
  readTime?:   number   // minutes
}

const LANG_SUFFIX: Record<string, string> = { he: 'He', ru: 'Ru', ar: 'Ar', fr: 'Fr' }
/** Pick the guide's title/excerpt in the active language, falling back to English. */
function locGuide(g: Guide, field: 'title' | 'excerpt', lang: string): string {
  const suf = LANG_SUFFIX[lang.split('-')[0]]
  const key = (field + suf) as keyof Guide
  return (suf && (g[key] as string | undefined)) || g[field]
}

const CATEGORY_KEYS: Record<string, string> = {
  buying:        'guides.categories.buying',
  renting:       'guides.categories.renting',
  taxes:         'guides.categories.taxes',
  legal:         'guides.categories.legal',
  finance:       'guides.categories.finance',
  newcomers:     'guides.categories.newcomers',
  market:        'guides.categories.market',
  neighborhoods: 'guides.categories.neighborhoods',
}

export default function Guides() {
  const { t, i18n } = useTranslation()
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)

  useSeo({
    title: t('guides.seoTitle'),
    description: t('guides.seoDescription'),
    url: 'https://www.bebkey.com/guides',
  })

  useEffect(() => {
    fetch('/guides/index.json')
      .then(r => r.ok ? r.json() : [])
      .then((data: Guide[]) => setGuides(Array.isArray(data) ? data : []))
      .catch(() => setGuides([]))
      .finally(() => setLoading(false))
  }, [])

  // Group guides by category for navigation
  const byCategory: Record<string, Guide[]> = {}
  for (const g of guides) {
    (byCategory[g.category] ??= []).push(g)
  }
  const categoryOrder = ['newcomers', 'buying', 'renting', 'finance', 'taxes', 'legal', 'market', 'neighborhoods']
  const orderedCategories = categoryOrder.filter(c => byCategory[c]?.length)

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">
        {t('guides.title')}
      </h1>
      <p className="text-gray-500 max-w-3xl mb-10 leading-relaxed">
        {t('guides.subtitle')}
      </p>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-100 h-32 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : guides.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {t('guides.empty')}
        </p>
      ) : (
        orderedCategories.map(cat => (
          <section key={cat} className="mb-12">
            <h2 className="text-lg font-bold text-brand-blue uppercase tracking-wide mb-4">
              {t(CATEGORY_KEYS[cat] ?? cat)}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {byCategory[cat]!.map(g => (
                <Link
                  key={g.slug}
                  to={`/guides/${g.slug}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5"
                >
                  <h3 className="text-base font-bold text-gray-800 mb-2">
                    {locGuide(g, 'title', i18n.language)}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2">
                    {locGuide(g, 'excerpt', i18n.language)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {g.readTime ? (
                      <span>{t('guides.minRead', { count: g.readTime })}</span>
                    ) : null}
                    <span className="text-brand-blue font-medium">
                      {t('guides.read')} →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
