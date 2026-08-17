/**
 * <CityCombobox /> — writable, searchable city picker.
 *
 * Replaces the plain <select> city dropdown: the user can TYPE to filter the
 * list, and options are sorted alphabetically by their displayed (translated)
 * name in the current language — so the English list is A→Z in English, the
 * Hebrew list A→Z in Hebrew, etc. Selecting an option calls onChange with the
 * canonical Hebrew city string the DB stores.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { translateCity } from '../lib/cityNames'

interface Props {
  value: string                      // selected canonical Hebrew city ('' = all)
  cities: string[]                   // canonical Hebrew city names
  onChange: (city: string) => void
  placeholder?: string
  allLabel?: string                  // label for the "all cities" reset option
  className?: string
}

export default function CityCombobox({
  value, cities, onChange, placeholder, allLabel, className,
}: Props) {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Sort by the DISPLAYED name in the active language, then filter by query
  // (match the translated label OR the raw Hebrew so either works).
  const options = useMemo(() => {
    const collator = lang === 'he' ? 'he' : lang
    const withLabel = cities.map(c => ({ city: c, label: translateCity(c, lang) }))
    withLabel.sort((a, b) => a.label.localeCompare(b.label, collator, { sensitivity: 'base' }))
    const query = q.trim().toLowerCase()
    if (!query) return withLabel
    return withLabel.filter(o =>
      o.label.toLowerCase().includes(query) || o.city.toLowerCase().includes(query),
    )
  }, [cities, q, lang])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQ('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selectedLabel = value ? translateCity(value, lang) : ''
  const choose = (city: string) => { onChange(city); setQ(''); setOpen(false) }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={open ? q : selectedLabel}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => { setQ(''); setOpen(true) }}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && options.length) { e.preventDefault(); choose(options[0].city) }
          else if (e.key === 'Escape') { setOpen(false); setQ('') }
        }}
        className={className ??
          'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white'}
      />
      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose('')}
              className={`w-full text-start px-3 py-2 hover:bg-gray-100 ${!value ? 'font-semibold text-brand-blue' : ''}`}
            >
              {allLabel ?? 'All'}
            </button>
          </li>
          {options.map(o => (
            <li key={o.city}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.city)}
                className={`w-full text-start px-3 py-2 hover:bg-gray-100 ${o.city === value ? 'font-semibold text-brand-blue' : ''}`}
              >
                {o.label}
              </button>
            </li>
          ))}
          {options.length === 0 && (
            <li className="px-3 py-2 text-gray-400">—</li>
          )}
        </ul>
      )}
    </div>
  )
}
