/**
 * <AiSearchBar />
 *
 * Chat-style search input.  User types a free-text query in any
 * supported language (he/en/ru/ar/fr), we POST it to /api/ai-search
 * where Claude Haiku parses it into BebKey's structured filters, and
 * we navigate to /search?city=...&priceMax=...&dealType=... - the
 * existing Search page picks it up unchanged.
 *
 * This is BebKey's counter to keyz.ai's flagship "natural language
 * search" feature - and we run it on top of 19.5K+ aggregated listings
 * they can't match.
 *
 * Props:
 *   variant: 'hero' | 'compact' - controls sizing for Home hero vs
 *            inline placement on Search.tsx.
 */
import { useState, useMemo, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Props {
  variant?: 'hero' | 'compact'
}

const PLACEHOLDER_BY_LANG: Record<string, string> = {
  he: 'דירת 3 חדרים בתל אביב להשכרה עד 8,000 ₪',
  en: '3-bedroom apartment in Tel Aviv to rent under 8,000 ₪',
  ru: 'квартира 3 комнаты в Тель-Авиве в аренду до 8000 ₪',
  ar: 'شقة 3 غرف في تل أبيب للإيجار حتى 8000 ₪',
  fr: 'appartement 3 pièces à Tel Aviv à louer moins de 8 000 ₪',
}

const LABEL_BY_LANG: Record<string, string> = {
  he: 'חיפוש חכם (AI)',
  en: 'AI search',
  ru: 'AI-поиск',
  ar: 'بحث ذكي (AI)',
  fr: 'Recherche IA',
}

const BUTTON_BY_LANG: Record<string, string> = {
  he: 'חפש',
  en: 'Search',
  ru: 'Найти',
  ar: 'ابحث',
  fr: 'Chercher',
}

// Multiple hints per language — rotated randomly on each render so users
// discover the range of things they can ask (region names, sub-regions,
// lifestyle, "near X" concepts, cross-language spelling tolerance).
const HINTS_BY_LANG: Record<string, string[]> = {
  he: [
    'נסה: "פנטהאוז בהרצליה עם חניה ומרפסת"',
    'נסה: "3 חדרים במרכז עד 2 מיליון קרוב לים"',
    'נסה: "דירה משופצת בבית שמש עם ממ״ד"',
    'נסה: "סטודיו בפלורנטין עם מזגן להשכרה"',
    'נסה: "בית פרטי בשרון עם גינה עד 4 מיליון"',
    'נסה: "דירה לזוג צעיר קרוב לרכבת קלה"',
  ],
  en: [
    'Try: "Studio in Florentin with balcony under 6000"',
    'Try: "Penthouse Herzliya parking sea view"',
    'Try: "3-bedroom Ramat Gan near light rail under 2.5M"',
    'Try: "Family-friendly Modi\'in with mamad and garden"',
    'Try: "Renovated apartment in Tel Aviv Old North for rent"',
    'Try: "Buy under 1.5M in the Krayot with elevator"',
  ],
  ru: [
    'Попробуйте: «студия во Флорентине с балконом»',
    'Попробуйте: «пентхаус Герцлия с парковкой и видом»',
    'Попробуйте: «3 комнаты в Хайфе аренда до 5000»',
    'Попробуйте: «квартира в Нетании до 1.8 миллиона у моря»',
    'Попробуйте: «дом в Ришон-ле-Ционе с садом»',
  ],
  ar: [
    'جرّب: "شقة 3 غرف في حيفا للإيجار حتى 5000"',
    'جرّب: "بيت خاص في نتانيا مع حديقة"',
    'جرّب: "شقة عائلية في القدس مع مصعد"',
    'جرّب: "استوديو في تل أبيب قريب من البحر"',
  ],
  fr: [
    'Essayez : « Appartement 4 pièces à Netanya avec parking »',
    'Essayez : « Studio à Tel Aviv proche de la plage »',
    'Essayez : « Penthouse à Herzliya avec vue mer »',
    'Essayez : « Maison familiale à Raanana jusqu\'à 4M »',
    'Essayez : « 3 pièces à Jérusalem à louer moins de 7000 »',
  ],
}

export default function AiSearchBar({ variant = 'hero' }: Props) {
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [understood, setUnderstood] = useState<string | null>(null)

  const lang        = i18n.language.split('-')[0] || 'he'
  const placeholder = PLACEHOLDER_BY_LANG[lang] ?? PLACEHOLDER_BY_LANG.en
  const label       = LABEL_BY_LANG[lang]       ?? LABEL_BY_LANG.en
  const button      = BUTTON_BY_LANG[lang]      ?? BUTTON_BY_LANG.en
  // One randomly-chosen hint per mount so users see the range of things
  // they can ask. useMemo pins it for the lifetime of the component so
  // it doesn't flicker on every re-render.
  const hint        = useMemo(() => {
    const pool = HINTS_BY_LANG[lang] ?? HINTS_BY_LANG.en
    return pool[Math.floor(Math.random() * pool.length)]
  }, [lang])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 2) return

    setLoading(true)
    setError(null)
    setUnderstood(null)
    try {
      const resp = await fetch('/api/ai-search', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ query: q }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${resp.status}`)
      }
      const data = await resp.json() as { queryUrl: string; understood: string }
      setUnderstood(data.understood)
      // Brief delay so the user sees what was parsed before navigation.
      setTimeout(() => navigate(data.queryUrl), 600)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setLoading(false)
    }
  }

  const isHero = variant === 'hero'

  return (
    <div className={isHero ? 'mt-6' : 'mb-4'}>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span
            className={
              'absolute top-1/2 -translate-y-1/2 ' +
              (i18n.dir() === 'rtl' ? 'right-4' : 'left-4') +
              ' pointer-events-none flex items-center gap-1.5 text-brand-orange text-sm font-semibold'
            }
            aria-hidden="true"
          >
            <span className="text-lg">✨</span>
            <span className="hidden sm:inline">{label}</span>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            aria-label={label}
            className={
              (i18n.dir() === 'rtl' ? 'pr-32 sm:pr-36 pl-5' : 'pl-32 sm:pl-36 pr-5') +
              ' w-full py-4 rounded-xl text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange shadow-lg disabled:opacity-70'
            }
          />
        </div>
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="px-8 py-4 bg-brand-orange hover:bg-orange-500 disabled:bg-orange-300 disabled:cursor-not-allowed text-gray-900 font-bold rounded-xl transition-colors shadow-lg text-lg whitespace-nowrap"
        >
          {loading ? '...' : button}
        </button>
      </form>

      {/* Feedback row - hint when idle, understood when parsed, error if any */}
      <div className="mt-3 text-sm min-h-[1.5rem]">
        {error && (
          <span className="text-red-100 bg-red-900/40 px-3 py-1 rounded-md">
            {(() => {
              const errMsgs: Record<string, Record<string, string>> = {
                ai_unavailable: {
                  he: 'החיפוש החכם לא זמין כרגע — נסו את המסננים הרגילים.',
                  en: 'AI search is offline right now — try the normal filters.',
                  ru: 'AI-поиск сейчас недоступен — используйте обычные фильтры.',
                  ar: 'البحث الذكي غير متاح الآن — استخدم المرشحات العادية.',
                  fr: 'Recherche IA hors ligne — utilisez les filtres classiques.',
                },
                rate_limited: {
                  he: 'רגע לפני החיפוש הבא, בבקשה.',
                  en: 'One moment before the next search, please.',
                  ru: 'Подождите пару секунд перед следующим запросом.',
                  ar: 'مهلة قصيرة قبل البحث التالي.',
                  fr: 'Un instant avant la prochaine recherche.',
                },
              }
              const key = error
              const localized = errMsgs[key]?.[lang]
              if (localized) return localized
              const fallback: Record<string, string> = {
                he: `לא הצלחתי לפרש את השאילתה (${error}). נסה ניסוח פשוט יותר.`,
                en: `Couldn't parse that query (${error}). Try a simpler phrasing.`,
                ru: `Не удалось разобрать запрос (${error}). Попробуйте проще.`,
                ar: `تعذر فهم الاستعلام (${error}). جرّب صياغة أبسط.`,
                fr: `Impossible d'interpréter (${error}). Essayez plus simple.`,
              }
              return fallback[lang] ?? fallback.en
            })()}
          </span>
        )}
        {!error && understood && (
          <span className={isHero ? 'text-blue-100' : 'text-gray-700'}>
            ✓ {understood}
          </span>
        )}
        {!error && !understood && !loading && (
          <span className={isHero ? 'text-blue-200/80' : 'text-gray-500'}>
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
