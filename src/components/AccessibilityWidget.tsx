/**
 * Accessibility Widget - IS 5568 / WCAG 2.1 AA controls
 * ────────────────────────────────────────────────────────────────────────────
 * Floating button (bottom-right corner) that opens a panel of physical
 * adjustments users can apply to the site to meet their needs.  Required for
 * Israeli law compliance (Equal Rights for Persons with Disabilities Law,
 * 5758-1998 + Accessibility Regulations 5773-2013).
 *
 *   ✓ Font scaling: smaller / default / larger / huge (4 sizes)
 *   ✓ High contrast (black-on-white forced theme)
 *   ✓ Inverted colours (negative contrast)
 *   ✓ Grayscale
 *   ✓ Highlight links (yellow background + underline on every <a>)
 *   ✓ Highlight headings (h1-h6 outlined + bold)
 *   ✓ Stop animations / motion
 *   ✓ Larger cursor
 *   ✓ Readable font (geometric sans-serif, +letter-spacing)
 *   ✓ Reading guide (horizontal line that follows the cursor)
 *   ✓ Reset everything
 *   ✓ Direct link to /accessibility statement
 *   ✓ All controls localised to he / en / ru / ar / fr
 *   ✓ State persisted in localStorage so settings survive page reloads
 *
 * All toggles work by adding/removing a class on <html>; matching CSS rules
 * live in src/index.css.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

// ── Settings shape + persistence ────────────────────────────────────────────
type FontSize = 'sm' | 'md' | 'lg' | 'xl'

interface A11ySettings {
  fontSize:        FontSize
  contrast:        boolean
  invert:          boolean
  grayscale:       boolean
  highlightLinks:  boolean
  highlightHeads:  boolean
  stopMotion:      boolean
  bigCursor:       boolean
  readableFont:    boolean
  readingGuide:    boolean
}

const DEFAULTS: A11ySettings = {
  fontSize:       'md',
  contrast:       false,
  invert:         false,
  grayscale:      false,
  highlightLinks: false,
  highlightHeads: false,
  stopMotion:     false,
  bigCursor:      false,
  readableFont:   false,
  readingGuide:   false,
}

const STORAGE_KEY = 'bebkey_a11y_v1'

function loadSettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveSettings(s: A11ySettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

// ── Apply settings to <html> as classes ─────────────────────────────────────
function applySettings(s: A11ySettings) {
  const html = document.documentElement
  const fontMap: Record<FontSize, string> = {
    sm: 'a11y-font-sm', md: '', lg: 'a11y-font-lg', xl: 'a11y-font-xl',
  }
  // Reset all our managed classes first
  html.classList.remove(
    'a11y-font-sm', 'a11y-font-lg', 'a11y-font-xl',
    'a11y-contrast', 'a11y-invert', 'a11y-grayscale',
    'a11y-links', 'a11y-heads',
    'a11y-no-motion', 'a11y-cursor', 'a11y-readable',
    'a11y-guide',
  )
  // Then apply the active ones
  if (fontMap[s.fontSize])  html.classList.add(fontMap[s.fontSize])
  if (s.contrast)           html.classList.add('a11y-contrast')
  if (s.invert)             html.classList.add('a11y-invert')
  if (s.grayscale)          html.classList.add('a11y-grayscale')
  if (s.highlightLinks)     html.classList.add('a11y-links')
  if (s.highlightHeads)     html.classList.add('a11y-heads')
  if (s.stopMotion)         html.classList.add('a11y-no-motion')
  if (s.bigCursor)          html.classList.add('a11y-cursor')
  if (s.readableFont)       html.classList.add('a11y-readable')
  if (s.readingGuide)       html.classList.add('a11y-guide')
}

// ── Reading-guide tracker (horizontal cursor-following line) ────────────────
function useReadingGuide(active: boolean) {
  useEffect(() => {
    if (!active) return
    const line = document.createElement('div')
    line.id = 'a11y-reading-guide-line'
    line.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'height:32px',
      'background:rgba(255,235,59,0.35)',
      'pointer-events:none', 'z-index:2147483646',
      'border-top:2px solid rgba(0,0,0,0.6)',
      'border-bottom:2px solid rgba(0,0,0,0.6)',
      'transition:top 40ms linear',
    ].join(';')
    document.body.appendChild(line)
    const onMove = (e: MouseEvent) => {
      line.style.top = `${Math.max(0, e.clientY - 16)}px`
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      line.remove()
    }
  }, [active])
}

// ── Component ───────────────────────────────────────────────────────────────
export default function AccessibilityWidget() {
  const { t, i18n } = useTranslation()
  const [open, setOpen]         = useState(false)
  const [settings, setSettings] = useState<A11ySettings>(() => loadSettings())
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // Apply settings on mount + whenever they change
  useEffect(() => {
    applySettings(settings)
    saveSettings(settings)
  }, [settings])

  useReadingGuide(settings.readingGuide)

  // Close on outside click + Esc key
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!panelRef.current || !btnRef.current) return
      if (panelRef.current.contains(e.target as Node)) return
      if (btnRef.current.contains(e.target as Node))   return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const update = useCallback(<K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggle = useCallback((key: keyof A11ySettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const reset = useCallback(() => setSettings({ ...DEFAULTS }), [])

  // Position depends on text direction (RTL flips left/right)
  const isRtl = i18n.language === 'he' || i18n.language === 'ar'
  const sideClass = isRtl ? 'left-4' : 'right-4'

  return (
    <>
      {/* Floating launcher button */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label={t('a11y.open')}
        title={t('a11y.open')}
        className={`fixed bottom-4 ${sideClass} z-[2147483645] w-12 h-12 rounded-full bg-brand-blue text-white shadow-lg hover:scale-105 focus:outline-none focus:ring-4 focus:ring-brand-blue/40 flex items-center justify-center`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6"
          aria-hidden="true"
        >
          <circle cx="12" cy="4" r="2" />
          <path d="M19 7.5l-7 1-7-1-.5 2 5 .8L8 17l2.5 1 1.5-4 1.5 4 2.5-1-1.5-6.7 5-.8z" />
        </svg>
      </button>

      {/* Slide-in panel */}
      {open && (
        <div
          ref={panelRef}
          id="a11y-panel"
          role="dialog"
          aria-modal="false"
          aria-label={t('a11y.title')}
          className={`fixed bottom-20 ${sideClass} z-[2147483645] w-80 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto bg-white text-gray-800 rounded-2xl shadow-2xl border border-gray-200 p-4`}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">{t('a11y.title')}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('a11y.close')}
              className="text-gray-500 hover:text-gray-800 w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          {/* Font size - 4 buttons */}
          <FieldGroup label={t('a11y.fontSize')}>
            <div className="grid grid-cols-4 gap-1">
              {(['sm', 'md', 'lg', 'xl'] as FontSize[]).map(sz => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => update('fontSize', sz)}
                  aria-pressed={settings.fontSize === sz}
                  className={`py-2 rounded-lg text-sm border ${
                    settings.fontSize === sz
                      ? 'bg-brand-blue text-white border-brand-blue'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue'
                  }`}
                >
                  {{ sm: 'A-', md: 'A', lg: 'A+', xl: 'A++' }[sz]}
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* Boolean toggles */}
          <FieldGroup label={t('a11y.contrastGroup')}>
            <Toggle label={t('a11y.contrast')}       on={settings.contrast}       onClick={() => toggle('contrast')} />
            <Toggle label={t('a11y.invert')}         on={settings.invert}         onClick={() => toggle('invert')} />
            <Toggle label={t('a11y.grayscale')}      on={settings.grayscale}      onClick={() => toggle('grayscale')} />
          </FieldGroup>

          <FieldGroup label={t('a11y.contentGroup')}>
            <Toggle label={t('a11y.highlightLinks')} on={settings.highlightLinks} onClick={() => toggle('highlightLinks')} />
            <Toggle label={t('a11y.highlightHeads')} on={settings.highlightHeads} onClick={() => toggle('highlightHeads')} />
            <Toggle label={t('a11y.readableFont')}   on={settings.readableFont}   onClick={() => toggle('readableFont')} />
          </FieldGroup>

          <FieldGroup label={t('a11y.navigationGroup')}>
            <Toggle label={t('a11y.stopMotion')}     on={settings.stopMotion}     onClick={() => toggle('stopMotion')} />
            <Toggle label={t('a11y.bigCursor')}      on={settings.bigCursor}      onClick={() => toggle('bigCursor')} />
            <Toggle label={t('a11y.readingGuide')}   on={settings.readingGuide}   onClick={() => toggle('readingGuide')} />
          </FieldGroup>

          {/* Footer buttons */}
          <div className="mt-4 pt-3 border-t border-gray-200 flex flex-col gap-2">
            <button
              type="button"
              onClick={reset}
              className="w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
            >
              {t('a11y.reset')}
            </button>
            <Link
              to="/accessibility"
              onClick={() => setOpen(false)}
              className="w-full text-center py-2 rounded-lg bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue text-sm font-medium"
            >
              {t('a11y.statementLink')}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

// ── Internal helpers ────────────────────────────────────────────────────────
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-3">
      <legend className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">{label}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors ${
        on
          ? 'bg-brand-blue text-white border-brand-blue'
          : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue'
      }`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`w-9 h-5 rounded-full transition-colors relative ${on ? 'bg-white/30' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
            on ? 'left-4 bg-white' : 'left-0.5 bg-white shadow'
          }`}
        />
      </span>
    </button>
  )
}
