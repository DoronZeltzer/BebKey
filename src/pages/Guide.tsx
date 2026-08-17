/**
 * Guide - renders one markdown article from /public/guides/.
 *
 * Mirrors BlogPost but with:
 *   • A category badge in the header
 *   • "Related guides" footer (other guides in same category)
 *   • Article + HowTo JSON-LD for richer Google snippets
 *   • "See listings →" CTA at the bottom (the whole point of these
 *     guides is funnel-top SEO that converts to listing views)
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
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
  readTime?:   number
}

const LANG_SUFFIX: Record<string, string> = { he: 'He', ru: 'Ru', ar: 'Ar', fr: 'Fr' }
/** Pick the guide's title/excerpt in the active language, falling back to English. */
function locGuide(g: Guide, field: 'title' | 'excerpt', lang: string): string {
  const suf = LANG_SUFFIX[lang.split('-')[0]]
  const key = (field + suf) as keyof Guide
  return (suf && (g[key] as string | undefined)) || g[field]
}

// Category → i18n key
const CATEGORY_KEY: Record<string, string> = {
  buying:        'guides.categories.buying',
  renting:       'guides.categories.renting',
  taxes:         'guides.categories.taxes',
  legal:         'guides.categories.legal',
  finance:       'guides.categories.finance',
  newcomers:     'guides.categories.newcomers',
  market:        'guides.categories.market',
  neighborhoods: 'guides.categories.neighborhoods',
}
// English category names kept for JSON-LD `articleSection` (schema.org
// convention is English category names for search-engine parsing).
const CATEGORY_EN: Record<string, string> = {
  buying: 'Buying', renting: 'Renting', taxes: 'Taxes & Fees', legal: 'Legal',
  finance: 'Mortgage', newcomers: 'For Olim', market: 'Market', neighborhoods: 'Neighborhoods',
}

export default function GuidePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()
  // Only show the "reading the English version" notice when we actually fell
  // back to English (i.e. no translated body exists for this language).
  const [usedFallback, setUsedFallback] = useState(false)
  const showTranslationNotice = usedFallback && !['he', 'en'].includes(i18n.language.split('-')[0])

  const [meta, setMeta]       = useState<Guide | null>(null)
  const [allGuides, setAll]   = useState<Guide[]>([])
  const [html, setHtml]       = useState('')
  const [error, setError]     = useState(false)

  useSeo({
    title:       meta ? locGuide(meta, 'title', i18n.language) : 'Real Estate Guide',
    description: meta ? locGuide(meta, 'excerpt', i18n.language) : '',
    url:         `https://www.bebkey.com/guides/${slug}`,
    type:        'article',
  })

  // Load metadata index + the markdown body for this slug
  useEffect(() => {
    setHtml('')
    setError(false)
    fetch('/guides/index.json')
      .then(r => r.ok ? r.json() : [])
      .then((data: Guide[]) => {
        const list = Array.isArray(data) ? data : []
        setAll(list)
        setMeta(list.find(g => g.slug === slug) ?? null)
      })

    // Prefer a language-specific body (slug.<lang>.md); fall back to English.
    const lang = i18n.language.split('-')[0]
    const url = lang === 'en' ? `/guides/${slug}.md` : `/guides/${slug}.${lang}.md`
    fetch(url)
      .then(async r => {
        if (r.ok) { setUsedFallback(false); return r.text() }
        setUsedFallback(true)
        const fb = await fetch(`/guides/${slug}.md`)   // English fallback
        return fb.ok ? fb.text() : null
      })
      .then(md => {
        if (md == null) { setError(true); return }
        setHtml(marked.parse(md, { async: false }) as string)
      })
      .catch(() => setError(true))
  }, [slug, i18n.language])

  // Article + HowTo JSON-LD
  useEffect(() => {
    if (!meta) return
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   locGuide(meta, 'title', i18n.language),
      description: locGuide(meta, 'excerpt', i18n.language),
      inLanguage: i18n.language.split('-')[0] === 'he' ? 'he-IL' : i18n.language.split('-')[0],
      author:     { '@type': 'Organization', name: 'BebKey' },
      publisher:  {
        '@type': 'Organization',
        name:    'BebKey',
        logo:    { '@type': 'ImageObject', url: 'https://www.bebkey.com/icon-512.png' },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `https://www.bebkey.com/guides/${slug}` },
      articleSection:   CATEGORY_EN[meta.category],
    }
    let el = document.getElementById('guide-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'guide-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [meta, slug, i18n.language])

  // BreadcrumbList JSON-LD.  When present, Google replaces the URL in the
  // SERP snippet with a clickable "bebkey.com › Guides › <Title>" trail —
  // measurably higher CTR than the raw URL.
  useEffect(() => {
    if (!meta) return
    const title = locGuide(meta, 'title', i18n.language)
    const guidesLabel = t('guides.indexLabel')
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BebKey', item: 'https://www.bebkey.com/' },
        { '@type': 'ListItem', position: 2, name: guidesLabel, item: 'https://www.bebkey.com/guides' },
        { '@type': 'ListItem', position: 3, name: title, item: `https://www.bebkey.com/guides/${slug}` },
      ],
    }
    let el = document.getElementById('guide-breadcrumbs-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'guide-breadcrumbs-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [meta, slug, i18n.language])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">📖</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {t('guides.notFound')}
        </h1>
        <Link to="/guides" className="text-brand-blue font-medium hover:underline">
          ← {t('guides.backToGuides')}
        </Link>
      </div>
    )
  }

  const related = meta
    ? allGuides.filter(g => g.category === meta.category && g.slug !== slug).slice(0, 4)
    : []

  return (
    <article className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Link to="/guides" className="text-sm text-gray-500 hover:text-brand-blue inline-flex items-center gap-1 mb-6 transition-colors">
        ← {t('guides.backToGuides')}
      </Link>

      {meta?.category && (
        <p className="text-xs uppercase tracking-widest text-brand-orange font-bold mb-3">
          {t(CATEGORY_KEY[meta.category] ?? meta.category)}
        </p>
      )}

      {showTranslationNotice && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          {t('article.translationNotice')}
        </div>
      )}

      {/* Editorial typography - heavier headings, comfortable line height,
          serif body for long-form readability, custom callout for blockquotes
          and "Tip:" notes.  All emoji and decorative chars stripped. */}
      <div
        className="
          guide-body
          prose prose-lg max-w-none
          prose-headings:font-extrabold prose-headings:text-gray-900 prose-headings:tracking-tight
          prose-h1:text-4xl prose-h1:mb-4 prose-h1:leading-tight
          prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-100
          prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-2
          prose-p:text-gray-700 prose-p:leading-[1.75] prose-p:my-4
          prose-li:text-gray-700 prose-li:leading-[1.7] prose-li:my-1.5
          prose-strong:text-gray-900 prose-strong:font-semibold
          prose-a:text-brand-blue prose-a:no-underline hover:prose-a:underline
          prose-blockquote:not-italic prose-blockquote:border-l-4 prose-blockquote:border-brand-orange
          prose-blockquote:bg-orange-50 prose-blockquote:py-3 prose-blockquote:px-5
          prose-blockquote:rounded-r-xl prose-blockquote:my-6
          prose-blockquote:text-gray-800 prose-blockquote:font-normal
          prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:px-1.5 prose-code:py-0.5
          prose-code:rounded prose-code:text-[0.9em] prose-code:font-medium
          prose-code:before:content-none prose-code:after:content-none
        "
        // Content is hand-authored markdown we ship in the repo - safe to render.
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-gray-400">Loading...</p>' }}
      />

      {/* CTA - every guide funnels to a listings search.  This is the whole
          reason these guides exist for SEO. */}
      <div className="mt-12 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-2">
          {t('guides.readyToFind')}
        </h2>
        <p className="text-gray-600 text-sm mb-4 max-w-xl mx-auto">
          {t('guides.searchDesc')}
        </p>
        <Link
          to="/search"
          className="inline-block px-6 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
        >
          {t('guides.startSearching')} →
        </Link>
      </div>

      {/* Related guides in same category */}
      {related.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t('guides.relatedGuides')}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {related.map(g => (
              <Link
                key={g.slug}
                to={`/guides/${g.slug}`}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-brand-blue transition-colors"
              >
                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                  {locGuide(g, 'title', i18n.language)}
                </h3>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {locGuide(g, 'excerpt', i18n.language)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
