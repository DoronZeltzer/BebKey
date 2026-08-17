import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'

type Category =
  | 'general'
  | 'listing_issue'
  | 'agent_plans'
  | 'bug'
  | 'press'
  | 'privacy'

const CATEGORIES: Category[] = [
  'general',
  'listing_issue',
  'agent_plans',
  'bug',
  'press',
  'privacy',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Contact() {
  useSeo({
    title: 'Contact',
    description: 'Get in touch with the BebKey team. We respond within 1-2 business days.',
  })
  const { t } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  // ── Form state ─────────────────────────────────────────────────────────
  const [name, setName]              = useState(user?.user_metadata?.full_name ?? '')
  const [email, setEmail]            = useState(user?.email ?? '')
  const [phone, setPhone]            = useState('')
  const [category, setCategory]      = useState<Category>(
    (searchParams.get('category') as Category) ?? 'general',
  )
  const [listingUrl, setListingUrl]  = useState(searchParams.get('listing') ?? '')
  const [message, setMessage]        = useState('')
  // Honeypot - bots fill this in, real users never see it.
  const [website, setWebsite]        = useState('')

  // ── Submission state ───────────────────────────────────────────────────
  const [submitting, setSubmitting]  = useState(false)
  const [success, setSuccess]        = useState(false)
  const [error, setError]            = useState('')

  // ── Validation (live, for the submit button) ───────────────────────────
  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      EMAIL_RE.test(email.trim()) &&
      CATEGORIES.includes(category) &&
      message.trim().length >= 10 &&
      !submitting
    )
  }, [name, email, category, message, submitting])

  // Pre-fill listing URL if user came from "report a listing" link
  useEffect(() => {
    const listing = searchParams.get('listing')
    if (listing && !listingUrl) {
      setListingUrl(listing)
      setCategory('listing_issue')
    }
  }, [searchParams])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       name.trim(),
          email:      email.trim(),
          phone:      phone.trim(),
          category,
          listingUrl: listingUrl.trim(),
          message:    message.trim(),
          website,   // honeypot
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        // Map known server-side error codes to friendly i18n strings.
        const code = data.error ?? 'submit_failed'
        if (code === 'rate_limited') {
          setError(t('contact.errors.rate_limited'))
        } else if (code === 'invalid_email') {
          setError(t('contact.errors.invalid_email'))
        } else {
          setError(t('contact.errors.generic'))
        }
        setSubmitting(false)
        return
      }
      setSuccess(true)
    } catch {
      setError(t('contact.errors.generic'))
      setSubmitting(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t('contact.success.title')}</h2>
          <p className="text-gray-500 text-sm mb-6">{t('contact.success.body')}</p>
          <Link to="/" className="text-brand-blue font-medium hover:underline text-sm">
            {t('contact.success.backHome')}
          </Link>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">
            {t('contact.pageTitle')}
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            {t('contact.pageSubtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Form (2/3 on large screens) */}
          <div className="lg:col-span-2">
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl shadow-md p-6 sm:p-8 flex flex-col gap-4"
            >
              {/* Honeypot - hidden from real users via inline style + aria-hidden */}
              <div
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
              >
                <label>
                  Website (leave blank)
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {/* Name + Email */}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {t('contact.form.name')} *
                  </span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {t('contact.form.email')} *
                  </span>
                  <input
                    type="email"
                    required
                    maxLength={200}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </label>
              </div>

              {/* Phone + Category */}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {t('contact.form.phone')}{' '}
                    <span className="text-gray-400 text-xs">
                      ({t('contact.form.optional')})
                    </span>
                  </span>
                  <input
                    type="tel"
                    maxLength={30}
                    placeholder="05X-XXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {t('contact.form.category')} *
                  </span>
                  <select
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    className="border border-gray-300 rounded-lg px-4 py-3 text-base bg-white
                               focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`contact.categories.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Listing URL - only when category is listing_issue */}
              {category === 'listing_issue' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {t('contact.form.listingUrl')}{' '}
                    <span className="text-gray-400 text-xs">
                      ({t('contact.form.optional')})
                    </span>
                  </span>
                  <input
                    type="url"
                    maxLength={500}
                    placeholder="https://www.bebkey.com/listing/..."
                    value={listingUrl}
                    onChange={(e) => setListingUrl(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </label>
              )}

              {/* Message */}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  {t('contact.form.message')} *
                </span>
                <textarea
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base
                             focus:outline-none focus:ring-2 focus:ring-brand-blue resize-y"
                />
                <span className="text-xs text-gray-400 self-end">
                  {message.length} / 4000
                </span>
              </label>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="bg-brand-blue text-white py-3 rounded-lg font-semibold
                           hover:bg-blue-700 transition-colors disabled:opacity-60
                           disabled:cursor-not-allowed"
              >
                {submitting ? t('contact.form.sending') : t('contact.form.send')}
              </button>

              <p className="text-xs text-gray-500 text-center">
                {t('contact.responseTime')}
              </p>
            </form>
          </div>

          {/* Sidebar (1/3 on large) */}
          <aside className="flex flex-col gap-4">
            {/* Direct email */}
            <div className="bg-white rounded-2xl shadow-md p-5">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">
                {t('contact.directEmail.title')}
              </h3>
              <a
                href="mailto:support@bebkey.com"
                className="text-brand-blue text-sm hover:underline break-all"
              >
                support@bebkey.com
              </a>
              <p className="text-xs text-gray-400 mt-1">
                {t('contact.directEmail.subtitle')}
              </p>
            </div>

            {/* Self-serve deflectors */}
            <div className="bg-white rounded-2xl shadow-md p-5">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">
                {t('contact.deflectors.title')}
              </h3>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li>
                  <Link
                    to="/help#pricing"
                    className="text-brand-blue hover:underline flex items-center gap-1"
                  >
                    → {t('contact.deflectors.pricing')}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/help#list-property"
                    className="text-brand-blue hover:underline flex items-center gap-1"
                  >
                    → {t('contact.deflectors.submitListing')}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/help#delete-account"
                    className="text-brand-blue hover:underline flex items-center gap-1"
                  >
                    → {t('contact.deflectors.deleteAccount')}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/help#saved-listings"
                    className="text-brand-blue hover:underline flex items-center gap-1"
                  >
                    → {t('contact.deflectors.savedListings')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal links */}
            <div className="bg-white rounded-2xl shadow-md p-5">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">
                {t('contact.legal.title')}
              </h3>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  <Link to="/terms" className="text-gray-600 hover:text-brand-blue">
                    {t('common.terms')}
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-gray-600 hover:text-brand-blue">
                    {t('common.privacy')}
                  </Link>
                </li>
                <li>
                  <Link to="/refund" className="text-gray-600 hover:text-brand-blue">
                    {t('common.refunds')}
                  </Link>
                </li>
                <li>
                  <Link to="/accessibility" className="text-gray-600 hover:text-brand-blue">
                    {t('contact.legal.accessibility')}
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
