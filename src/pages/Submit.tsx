import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { limitForPlan } from '../lib/listingLimits'
import { getUserSubscription } from '../lib/subscriptions'
import { parseListingText } from '../lib/importParse'
import { facebookShareUrl, buildListingText, YAD2_POST_URL } from '../lib/crosspost'

const PROPERTY_TYPES = [
  'דירה', 'דירת גן', "בית פרטי/ קוטג'", 'דו משפחתי', 'דופלקס',
  'טריפלקס', "גג/ פנטהאוז", 'יחידת דיור', 'פרויקט חדש',
  'בניין מגורים', 'מגרשים', 'מחסן', 'חניה', "מרתף/ פרטר",
  'משק עזר', 'משק חקלאי/ נחלה', 'כללי',
]

const CONDITIONS = [
  { value: 'new',        key: 'submit.conditionNew' },
  { value: 'good',       key: 'submit.conditionGood' },
  { value: 'renovated',  key: 'submit.conditionRenovated' },
  { value: 'needs_work', key: 'submit.conditionNeedsWork' },
]

const FEATURE_KEYS = [
  'parking', 'elevator', 'balcony', 'storageRoom',
  'mamad', 'airConditioning', 'furnished', 'animalsAllowed',
  'tabu', 'pinuiBinui', 'tama38', 'accessible',
] as const
type FeatureKey = typeof FEATURE_KEYS[number]

const FEATURE_DB_MAP: Record<FeatureKey, string> = {
  tabu:           'tabu',
  pinuiBinui:     'pinui_binui',
  tama38:         'tama_38',
  mamad:          'mamad',
  parking:        'parking',
  elevator:       'elevator',
  balcony:        'balcony',
  storageRoom:    'storage_room',
  animalsAllowed: 'animals_allowed',
  furnished:      'furnished',
  airConditioning:'air_conditioning',
  accessible:     'accessible',
}

interface FormData {
  price: string
  city: string
  street: string
  neighborhood: string
  rooms: string
  size_m2: string
  floor: string
  total_floors: string
  property_type: string
  condition: string
  deal_type: 'forsale' | 'rent'
  description: string
  contact_phone: string
}

function emptyFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) as Record<FeatureKey, boolean>
}

const EMPTY: FormData = {
  price: '', city: '', street: '', neighborhood: '',
  rooms: '', size_m2: '', floor: '', total_floors: '',
  property_type: '', condition: '', deal_type: 'forsale',
  description: '', contact_phone: '',
}

export default function Submit() {
  useSeo({
    title: 'Submit a listing',
    description: 'List your property on BebKey - reach buyers and renters across Israel.',
  })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState<FormData>(EMPTY)
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>(emptyFeatures())
  const [showMore, setShowMore] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── "Import from Facebook" (paste-based) ──────────────────────────────────
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  // ── Cross-post (success screen) ───────────────────────────────────────────
  const [yad2Copied, setYad2Copied] = useState(false)

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleImport() {
    const { fields, filled } = parseListingText(importText)
    // Only the description got carried over → nothing structured was detected.
    if (filled.length <= 1) {
      setImportMsg(t('submit.importNothing'))
      return
    }
    setForm((f) => ({ ...f, ...fields }) as FormData)
    setImportMsg(t('submit.importFilled', { count: filled.length }))
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures(f => ({ ...f, [key]: !f[key] }))
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 10)
    setImages(files)
    setPreviews(files.map((f) => URL.createObjectURL(f)))
  }

  function removeImage(idx: number) {
    setImages((imgs) => imgs.filter((_, i) => i !== idx))
    setPreviews((ps) => ps.filter((_, i) => i !== idx))
  }

  async function uploadImages(listingId: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of images) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${listingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('listing-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) { console.error('Image upload error:', error.message); continue }
      const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!user) { setError(t('submit.errorLogin')); return }
    if (!form.price || !form.city) { setError(t('submit.errorRequired')); return }

    // ── Plan-based listing cap enforcement ───────────────────────────────
    // Look up the user's current plan + count their active listings.  If
    // they're already at or over the cap for their tier, block the post
    // and direct them to the pricing page.  Server-side cross-check
    // happens via the ls-webhook lock/unlock mechanism, but stopping
    // it here gives the user a clear UX-level error message rather than
    // a silent "your listing was created but is locked".
    const sub = await getUserSubscription(user.id)
    const planLimit = limitForPlan(sub.plan)
    if (Number.isFinite(planLimit)) {
      const { count, error: countErr } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('posted_by_user_id', user.id)
        .eq('is_active', true)
      if (!countErr && typeof count === 'number' && count >= planLimit) {
        const planName = sub.plan || 'free'
        setError(t(
          'submit.errorLimitReached',
          `You've reached your ${planName} plan's limit of ${planLimit} active listings. Deactivate one or upgrade to Starter (10), Pro (30), or Agency (unlimited) on the pricing page.`,
          { plan: planName, limit: planLimit },
        ))
        return
      }
    }

    setUploading(true)

    // Build feature columns from state
    const featureCols: Record<string, boolean> = {}
    for (const key of FEATURE_KEYS) {
      featureCols[FEATURE_DB_MAP[key]] = features[key]
    }

    const { data: inserted, error: insertError } = await supabase
      .from('listings')
      .insert({
        source: 'manual',
        source_url: null,
        price: parseInt(form.price, 10) || null,
        city: form.city.trim() || null,
        street: form.street.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        rooms: parseFloat(form.rooms) || null,
        size_m2: parseFloat(form.size_m2) || null,
        floor: parseInt(form.floor, 10) || null,
        total_floors: parseInt(form.total_floors, 10) || null,
        property_type: form.property_type || null,
        condition: form.condition || null,
        deal_type: form.deal_type,
        description: form.description.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        images: [],
        is_active: true,
        posted_by_user_id: user.id,
        ...featureCols,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      setUploading(false)
      setError(insertError?.message ?? t('submit.errorFailed'))
      return
    }

    const listingId: string = inserted.id
    if (images.length > 0) {
      const imageUrls = await uploadImages(listingId)
      if (imageUrls.length > 0) {
        await supabase.from('listings').update({ images: imageUrls }).eq('id', listingId)
      }
    }

    setUploading(false)
    setSuccess(listingId)
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    const listingUrl = `https://www.bebkey.com/listing/${success}`
    const shareText = buildListingText({
      deal_type: form.deal_type, property_type: form.property_type,
      city: form.city, street: form.street, neighborhood: form.neighborhood,
      price: form.price, rooms: form.rooms, size_m2: form.size_m2,
      floor: form.floor, description: form.description, contact_phone: form.contact_phone,
    }, listingUrl)

    const shareFacebook = () =>
      window.open(facebookShareUrl(listingUrl), '_blank', 'noopener,noreferrer,width=670,height=560')
    const shareYad2 = async () => {
      try { await navigator.clipboard.writeText(shareText) } catch { /* clipboard may be blocked */ }
      setYad2Copied(true)
      window.open(YAD2_POST_URL, '_blank', 'noopener,noreferrer')
    }

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t('submit.successTitle')}</h2>
          <p className="text-gray-500 text-sm mb-6">{t('submit.successDesc')}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate(`/listing/${success}`)}
              className="px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
            >
              {t('submit.viewListing')}
            </button>
            <button
              onClick={() => { setForm(EMPTY); setFeatures(emptyFeatures()); setImages([]); setPreviews([]); setImportText(''); setImportMsg(null); setYad2Copied(false); setSuccess(null) }}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              {t('submit.addAnother')}
            </button>
          </div>

          {/* ── Cross-post: reach more people ── */}
          <div className="mt-6 pt-6 border-t border-gray-100 text-left">
            <p className="text-sm font-semibold text-gray-700">{t('submit.crosspostTitle')}</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">{t('submit.crosspostHint')}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={shareFacebook}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#1877F2] text-white rounded-lg text-sm font-semibold hover:bg-[#0f66d0] transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
                </svg>
                {t('submit.shareFacebook')}
              </button>
              <button
                onClick={shareYad2}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#ffcb05] text-gray-900 rounded-lg text-sm font-semibold hover:brightness-95 transition"
              >
                {yad2Copied ? t('submit.yad2Copied') : t('submit.copyYad2')}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">{t('submit.crosspostNote')}</p>
          </div>
        </div>
      </div>
    )
  }

  const activeFeatureCount = FEATURE_KEYS.filter(k => features[k]).length

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('submit.title')}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* ── Import from Facebook (paste-based) ── */}
        <div className="bg-[#1877F2]/5 rounded-xl border border-[#1877F2]/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowImport(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-[#1877F2] hover:bg-[#1877F2]/5 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
              </svg>
              {t('submit.importTitle')}
            </span>
            <svg className={`w-4 h-4 transition-transform ${showImport ? 'rotate-180' : ''}`}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showImport && (
            <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[#1877F2]/10 pt-3">
              <p className="text-xs text-gray-500">{t('submit.importHint')}</p>
              <textarea
                rows={4}
                value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportMsg(null) }}
                placeholder={t('submit.importPlaceholder')}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importText.trim().length < 3}
                  className="px-4 py-2 bg-[#1877F2] text-white rounded-lg text-sm font-semibold hover:bg-[#0f66d0] transition disabled:opacity-50"
                >
                  {t('submit.importButton')}
                </button>
                {importMsg && <span className="text-xs text-gray-600">{importMsg}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Deal Type ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">{t('search.dealType')}</p>
          <div className="flex gap-3">
            {(['forsale', 'rent'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => set('deal_type', dt)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  form.deal_type === dt
                    ? 'border-brand-blue bg-brand-blue text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-blue/40'
                }`}
              >
                {dt === 'forsale' ? t('search.forSale') : t('search.forRent')}
              </button>
            ))}
          </div>
        </div>

        {/* ── Location ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-4">
          <p className="text-sm font-semibold text-gray-700">{t('submit.city')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.price')} *</label>
              <input
                type="number" min={0} step={1000}
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                required
                placeholder="0"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.city')} *</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                required
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.street')}</label>
              <input
                type="text"
                value={form.street}
                onChange={(e) => set('street', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.neighborhood')}</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>
        </div>

        {/* ── Property Details ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-4">
          <p className="text-sm font-semibold text-gray-700">{t('submit.propertyType')}</p>

          {/* Type + Condition */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.propertyType')}</label>
              <select
                value={form.property_type}
                onChange={(e) => set('property_type', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
              >
                <option value="">{t('submit.selectPlaceholder')}</option>
                {PROPERTY_TYPES.map((pt) => (
                  <option key={pt} value={pt}>{t(`listing.propertyTypes.${pt}`, pt)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{t('submit.condition')}</label>
              <select
                value={form.condition}
                onChange={(e) => set('condition', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
              >
                <option value="">{t('submit.selectPlaceholder')}</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{t(c.key)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rooms, Size, Floor, Total floors */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { field: 'rooms',        label: t('submit.rooms'),       step: '0.5' },
              { field: 'size_m2',      label: t('submit.size'),        step: '1' },
              { field: 'floor',        label: t('submit.floor'),       step: '1' },
              { field: 'total_floors', label: t('submit.totalFloors'), step: '1' },
            ].map(({ field, label, step }) => (
              <div key={field} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">{label}</label>
                <input
                  type="number" min={0} step={step}
                  value={form[field as keyof FormData]}
                  onChange={(e) => set(field as keyof FormData, e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── More Details (collapsible) ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              {t('search.moreFilters')}
              {activeFeatureCount > 0 && (
                <span className="bg-brand-blue text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeFeatureCount}
                </span>
              )}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showMore ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMore && (
            <div className="px-4 pb-4 flex flex-col gap-4 border-t border-gray-100">

              {/* Feature toggles */}
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('search.features')}</p>
                <div className="flex flex-wrap gap-2">
                  {FEATURE_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFeature(key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        features[key]
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue/50'
                      }`}
                    >
                      {t(`search.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Description ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">{t('submit.description')}</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('submit.descriptionPlaceholder')}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
          />
        </div>

        {/* ── Contact Phone ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">{t('submit.phone')}</label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={(e) => set('contact_phone', e.target.value)}
            placeholder="05X-XXXXXXX"
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>

        {/* ── Photos ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
          <label className="text-sm font-semibold text-gray-700">{t('submit.photos')}</label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-blue transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-500">
              {t('submit.uploadPhotos')} <span className="text-gray-400">{t('submit.uploadMax')}</span>
            </p>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          </div>

          {previews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {previews.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="w-20 h-16 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[10px] bg-black/50 rounded-b-lg">
                      {t('submit.cover')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="bg-brand-blue text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {t('submit.publishing')}
            </>
          ) : t('submit.submit')}
        </button>
      </form>
    </div>
  )
}
