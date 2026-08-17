import { useEffect } from 'react'

interface SeoOptions {
  title: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
}

const DEFAULT_DESC =
  'BebKey - Israel real estate in one place. Search apartments, houses, and rentals across every city, kibbutz, and moshav.'

// PNG, not SVG: WhatsApp/Telegram/X/Facebook/LinkedIn all reject SVG og:images.
const DEFAULT_IMAGE = 'https://www.bebkey.com/og-image.png'
const SITE_NAME = 'BebKey'

export function useSeo({ title, description, image, url, type = 'website' }: SeoOptions) {
  const fullTitle = title.includes('BebKey') ? title : `${title} | BebKey`
  const desc = description ?? DEFAULT_DESC
  const img  = image ?? DEFAULT_IMAGE
  // Canonical must be ONE clean URL per page — never window.location.href,
  // which carries query strings (?page=, filters, UTM…) and hashes. Including
  // them makes Google treat every variant as a separate duplicate and pick its
  // own canonical. Strip everything but origin + pathname.
  const canonical =
    url ??
    (typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : '')

  useEffect(() => {
    // Page title
    document.title = fullTitle

    function setMeta(selector: string, value: string) {
      let el = document.querySelector(selector) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        const attr = selector.startsWith('[name') ? 'name' : 'property'
        const val  = selector.replace(/\[|\]|"|name=|property=/g, '')
        el.setAttribute(attr, val)
        document.head.appendChild(el)
      }
      el.setAttribute('content', value)
    }

    function setLink(rel: string, href: string) {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
      if (!el) {
        el = document.createElement('link')
        el.setAttribute('rel', rel)
        document.head.appendChild(el)
      }
      el.setAttribute('href', href)
    }

    // Standard meta
    setMeta('[name="description"]', desc)

    // Open Graph
    setMeta('[property="og:title"]',       fullTitle)
    setMeta('[property="og:description"]', desc)
    setMeta('[property="og:image"]',       img)
    setMeta('[property="og:url"]',         canonical)
    setMeta('[property="og:type"]',        type)
    setMeta('[property="og:site_name"]',   SITE_NAME)

    // Twitter card
    setMeta('[name="twitter:card"]',        'summary_large_image')
    setMeta('[name="twitter:title"]',       fullTitle)
    setMeta('[name="twitter:description"]', desc)
    setMeta('[name="twitter:image"]',       img)

    // Canonical
    setLink('canonical', canonical)
  }, [fullTitle, desc, img, canonical, type])
}
