import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { CITY_TRANSLATIONS, translateCity } from '../lib/cityNames'

const ALL_CITIES = Object.keys(CITY_TRANSLATIONS)

const PROPERTY_TYPES = [
  { value: 'דירה' },
  { value: 'דירת גן' },
  { value: "בית פרטי/ קוטג'" },
  { value: 'דו משפחתי' },
  { value: 'דופלקס' },
  { value: "גג/ פנטהאוז" },
  { value: 'יחידת דיור' },
  { value: 'פרויקט חדש' },
]

export interface ClientFormData {
  client_name: string
  phone: string
  budget_min: string
  budget_max: string
  preferred_cities: string[]
  min_rooms: string
  max_rooms: string
  min_size_m2: string
  property_types: string[]
  notes: string
}

const EMPTY: ClientFormData = {
  client_name: '', phone: '', budget_min: '', budget_max: '',
  preferred_cities: [], min_rooms: '', max_rooms: '',
  min_size_m2: '', property_types: [], notes: '',
}

interface Props {
  agentId: string
  onClose: () => void
  onSaved: () => void
  initial?: ClientFormData
  editId?: string
}

export default function ClientForm({ agentId, onClose, onSaved, initial, editId }: Props) {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState<ClientFormData>(initial ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField(field: keyof ClientFormData, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleCity(city: string) {
    setForm(f => ({
      ...f,
      preferred_cities: f.preferred_cities.includes(city)
        ? f.preferred_cities.filter(c => c !== city)
        : [...f.preferred_cities, city],
    }))
  }

  function togglePropType(pt: string) {
    setForm(f => ({
      ...f,
      property_types: f.property_types.includes(pt)
        ? f.property_types.filter(p => p !== pt)
        : [...f.property_types, pt],
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_name.trim()) { setError(t('clientForm.nameRequired')); return }
    setSaving(true); setError('')

    const payload = {
      agent_id: agentId,
      client_name: form.client_name.trim(),
      phone: form.phone.trim() || null,
      budget_min: form.budget_min ? parseInt(form.budget_min) : null,
      budget_max: form.budget_max ? parseInt(form.budget_max) : null,
      preferred_cities: form.preferred_cities.length ? form.preferred_cities : null,
      min_rooms: form.min_rooms ? parseFloat(form.min_rooms) : null,
      max_rooms: form.max_rooms ? parseFloat(form.max_rooms) : null,
      min_size_m2: form.min_size_m2 ? parseInt(form.min_size_m2) : null,
      property_types: form.property_types.length ? form.property_types : null,
      notes: form.notes.trim() || null,
      is_active: true,
    }

    const { error: err } = editId
      ? await supabase.from('agent_clients').update(payload).eq('id', editId)
      : await supabase.from('agent_clients').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {editId ? t('clientForm.editTitle') : t('clientForm.addTitle')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-5">

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('clientForm.fullName')} *</label>
              <input
                type="text"
                value={form.client_name}
                onChange={e => setField('client_name', e.target.value)}
                placeholder="David Cohen"
                required
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('clientForm.phone')}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setField('phone', e.target.value)}
                placeholder="05X-XXXXXXX"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>

          {/* Budget */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{t('clientForm.budget')}</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number" min={0} step={1}
                value={form.budget_min}
                onChange={e => setField('budget_min', e.target.value)}
                placeholder={t('clientForm.min')}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <input
                type="number" min={0} step={1}
                value={form.budget_max}
                onChange={e => setField('budget_max', e.target.value)}
                placeholder={t('clientForm.max')}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>

          {/* Rooms + Size */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('clientForm.minRooms')}</label>
              <input type="number" min={1} step={0.5} value={form.min_rooms}
                onChange={e => setField('min_rooms', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('clientForm.maxRooms')}</label>
              <input type="number" min={1} step={0.5} value={form.max_rooms}
                onChange={e => setField('max_rooms', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('clientForm.minSize')}</label>
              <input type="number" min={0} step={1} value={form.min_size_m2}
                onChange={e => setField('min_size_m2', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
          </div>

          {/* Preferred cities */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-600">
              {t('clientForm.preferredCities')}
              {form.preferred_cities.length > 0 && (
                <span className="ml-2 text-brand-blue">({form.preferred_cities.length} {t('clientForm.selected')})</span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-2">
              {ALL_CITIES.map(city => {
                const label = translateCity(city, i18n.language)
                const selected = form.preferred_cities.includes(city)
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleCity(city)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selected
                        ? 'bg-brand-blue text-white border-brand-blue'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue/50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Property types */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-600">{t('clientForm.propertyTypes')}</label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map(pt => {
                const selected = form.property_types.includes(pt.value)
                return (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => togglePropType(pt.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selected
                        ? 'bg-brand-blue text-white border-brand-blue'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue/50'
                    }`}
                  >
                    {t(`listing.propertyTypes.${pt.value}`, pt.value)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{t('clientForm.notes')}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder={t('clientForm.notesPlaceholder')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? t('clientForm.saving') : editId ? t('clientForm.saveChanges') : t('clientForm.addClient')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              {t('clientForm.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
