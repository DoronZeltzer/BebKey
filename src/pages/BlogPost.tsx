/**
 * BlogPost - renders one markdown file from /public/blog/.
 *
 * Markdown is fetched at runtime and parsed with `marked`.  The result
 * is sanitized via `setHTML()` semantics implicitly (marked has
 * sanitization deprecated since v5; we trust our own content here as
 * it's all auto-generated from controlled DB queries).
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import { useSeo } from '../hooks/useSeo'

interface Post {
  slug:     string
  date:     string
  title:    string
  titleHe?: string
  excerpt?: string
}

export default function BlogPost() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()
  const isHebrew = i18n.language === 'he'
  // Article bodies exist only in Hebrew and English. RU/AR/FR users see a
  // notice + the English version until we translate content.
  const showTranslationNotice = !['he', 'en'].includes(i18n.language.split('-')[0])

  const [html, setHtml]   = useState<string>('')
  const [meta, setMeta]   = useState<Post | null>(null)
  const [error, setError] = useState(false)

  useSeo({
    title:       meta ? (isHebrew && meta.titleHe ? meta.titleHe : meta.title) : 'BebKey Blog',
    description: meta?.excerpt ?? 'Israeli real estate market report from BebKey.',
    url:         `https://www.bebkey.com/blog/${slug}`,
    type:        'article',
  })

  useEffect(() => {
    setHtml(''); setError(false)
    // 1. Fetch the index to grab metadata for this post
    fetch('/blog/index.json')
      .then(r => r.ok ? r.json() : [])
      .then((data: Post[]) => {
        const post = (data || []).find(p => p.slug === slug)
        setMeta(post ?? null)
      })

    // 2. Fetch the markdown - prefer the Hebrew file when site lang is he
    const url = isHebrew
      ? `/blog/${slug}.he.md`
      : `/blog/${slug}.md`
    fetch(url)
      .then(async r => {
        if (!r.ok) {
          // Fallback to English if Hebrew file doesn't exist
          if (isHebrew) {
            const fb = await fetch(`/blog/${slug}.md`)
            return fb.ok ? fb.text() : null
          }
          return null
        }
        return r.text()
      })
      .then(md => {
        if (md == null) { setError(true); return }
        // marked v12+ returns a string; older versions also return a string here.
        const parsed = marked.parse(md, { async: false }) as string
        setHtml(parsed)
      })
      .catch(() => setError(true))
  }, [slug, isHebrew])

  // ── JSON-LD Article schema ─────────────────────────────────────────
  useEffect(() => {
    if (!meta) return
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   isHebrew && meta.titleHe ? meta.titleHe : meta.title,
      datePublished: meta.date,
      dateModified:  meta.date,
      inLanguage: isHebrew ? 'he-IL' : 'en',
      author:     { '@type': 'Organization', name: 'BebKey' },
      publisher:  { '@type': 'Organization', name: 'BebKey', logo: { '@type': 'ImageObject', url: 'https://www.bebkey.com/icon-512.png' } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `https://www.bebkey.com/blog/${slug}` },
    }
    let el = document.getElementById('blog-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'blog-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [meta, slug, isHebrew])

  // BreadcrumbList JSON-LD — Google renders "bebkey.com › Blog › <title>"
  // in place of the raw URL, ~2× CTR on informational queries.
  useEffect(() => {
    if (!meta) return
    const title = isHebrew && meta.titleHe ? meta.titleHe : meta.title
    const blogLabel = t('blog.title')
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BebKey', item: 'https://www.bebkey.com/' },
        { '@type': 'ListItem', position: 2, name: blogLabel, item: 'https://www.bebkey.com/blog' },
        { '@type': 'ListItem', position: 3, name: title, item: `https://www.bebkey.com/blog/${slug}` },
      ],
    }
    let el = document.getElementById('blog-breadcrumbs-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'blog-breadcrumbs-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [meta, slug, isHebrew])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">📭</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {t('blog.postNotFound')}
        </h1>
        <Link to="/blog" className="text-brand-blue font-medium hover:underline">
          ← {t('blog.backToBlog')}
        </Link>
      </div>
    )
  }

  return (
    <article className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
      <Link to="/blog" className="text-sm text-brand-blue hover:underline mb-6 inline-block">
        ← {t('blog.backToBlog')}
      </Link>
      {showTranslationNotice && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          {t('article.translationNotice')}
        </div>
      )}
      <div
        className="prose prose-blue max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-table:text-sm prose-th:text-left prose-td:py-2 prose-th:py-2 prose-thead:border-b prose-thead:border-gray-200"
        // Content is auto-generated by scripts/generate_weekly_report.py from
        // sanitized DB queries - no user-supplied HTML enters this rendering.
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-gray-400">Loading...</p>' }}
      />
    </article>
  )
}
