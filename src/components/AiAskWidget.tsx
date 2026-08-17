/**
 * <AiAskWidget />
 *
 * Chat-style widget on the listing detail page.  Users ask free-text
 * questions about THIS specific property; we POST them with the
 * listing_id to /api/ai-ask, which grounds Claude Haiku on the
 * listing's own data + ai_summary.
 *
 * This is BebKey's counter to keyz.ai's listing-page AI chat.  Our
 * edge: we have 19.5K+ aggregated listings, they don't.
 *
 * Props:
 *   listingId   - passed to /api/ai-ask
 *   listingName - short label shown in the UI ("about this Tel Aviv apartment")
 */
import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  listingId:    string | number
  listingName?: string
}

interface Message {
  role:    'user' | 'assistant'
  content: string
}

const STARTERS_BY_LANG: Record<string, string[]> = {
  he: [
    'איך השכונה הזו? מתאימה למשפחות?',
    'יש פה גישה לתחבורה ציבורית?',
    'האם המחיר הגיוני לאזור?',
    'מה היתרונות והחסרונות המרכזיים?',
    'איזה בתי ספר יש באזור?',
    'האם השכונה בטוחה?',
    'מה המרחק מהמרכז?',
    'איך החניה ברחוב?',
  ],
  en: [
    'Is this neighborhood family-friendly?',
    'How is public transit nearby?',
    'Is the price reasonable for the area?',
    'What are the main pros and cons?',
    'What schools are in the area?',
    'Is the neighborhood safe?',
    'How far is it from the city center?',
    'What is parking like on this street?',
  ],
  ru: [
    'Этот район подходит для семей?',
    'Как с общественным транспортом?',
    'Цена адекватная для района?',
    'Какие плюсы и минусы у этой квартиры?',
    'Какие школы поблизости?',
    'Насколько безопасен этот район?',
    'Далеко ли от центра?',
    'Как с парковкой на улице?',
  ],
  ar: [
    'هل هذا الحي مناسب للعائلات؟',
    'كيف هي وسائل النقل العام؟',
    'هل السعر مناسب للمنطقة؟',
    'ما إيجابيات وسلبيات هذا العقار؟',
    'ما المدارس القريبة؟',
    'هل الحي آمن؟',
    'كم يبعد عن وسط المدينة؟',
    'كيف هو الوقوف في الشارع؟',
  ],
  fr: [
    'Ce quartier est-il familial ?',
    'Comment sont les transports publics ?',
    'Le prix est-il raisonnable pour le quartier ?',
    'Quels sont les avantages et inconvénients ?',
    'Quelles écoles y a-t-il dans le quartier ?',
    'Ce quartier est-il sûr ?',
    'À quelle distance du centre-ville ?',
    'Comment est le stationnement dans la rue ?',
  ],
}

const PLACEHOLDER_BY_LANG: Record<string, string> = {
  he: 'שאל שאלה על הדירה הזו...',
  en: 'Ask a question about this listing...',
  ru: 'Задайте вопрос об этой квартире...',
  ar: 'اسأل سؤالاً عن هذا العقار...',
  fr: 'Posez une question sur cette annonce...',
}

const HEADER_BY_LANG: Record<string, string> = {
  he: 'שאל את BebKey AI על הדירה',
  en: 'Ask BebKey AI about this listing',
  ru: 'Спросите BebKey AI об этой квартире',
  ar: 'اسأل BebKey AI عن هذا العقار',
  fr: 'Demandez à BebKey AI à propos de cette annonce',
}

const SEND_BY_LANG: Record<string, string> = {
  he: 'שלח', en: 'Send', ru: 'Отправить', ar: 'إرسال', fr: 'Envoyer',
}

export default function AiAskWidget({ listingId }: Props) {
  const { i18n } = useTranslation()
  const lang = (i18n.language.split('-')[0] || 'en') as keyof typeof STARTERS_BY_LANG

  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the bottom whenever a new message arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const starters    = STARTERS_BY_LANG[lang]    ?? STARTERS_BY_LANG.en
  const placeholder = PLACEHOLDER_BY_LANG[lang] ?? PLACEHOLDER_BY_LANG.en
  const header      = HEADER_BY_LANG[lang]      ?? HEADER_BY_LANG.en
  const sendLabel   = SEND_BY_LANG[lang]        ?? SEND_BY_LANG.en

  async function send(rawText: string) {
    const text = rawText.trim()
    if (text.length < 2 || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const resp = await fetch('/api/ai-ask', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          question:   text,
          history:    newMessages.slice(0, -1),  // history doesn't include the question itself
          lang,
        }),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error ?? `HTTP ${resp.status}`)
      }
      const data = await resp.json() as { answer: string }
      setMessages([...newMessages, { role: 'assistant', content: data.answer }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-gradient-to-r from-blue-50 to-orange-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between hover:from-blue-100 hover:to-orange-100 transition group"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-blue">
          <span className="text-lg">✨</span>
          {header}
        </span>
        <span className="text-xs text-gray-500 group-hover:text-gray-700">›</span>
      </button>
    )
  }

  return (
    <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-50 to-orange-50 px-4 py-2 flex items-center justify-between border-b border-blue-100">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-blue">
          <span className="text-lg">✨</span>
          {header}
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="close"
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div
        ref={scrollRef}
        className="px-4 py-3 max-h-72 overflow-y-auto text-sm space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs">{placeholder}</p>
            <div className="flex flex-wrap gap-1.5">
              {starters.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full px-3 py-1.5 text-brand-blue transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'flex justify-end'
                  : 'flex justify-start'
              }
            >
              <div
                className={
                  (m.role === 'user'
                    ? 'bg-brand-blue text-white'
                    : 'bg-gray-100 text-gray-800') +
                  ' rounded-2xl px-3 py-2 max-w-[85%] whitespace-pre-wrap'
                }
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl px-3 py-2 text-xs">
              ...
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {(() => {
              const msgs: Record<string, Record<string, string>> = {
                ai_unavailable: {
                  he: 'ה-AI לא זמין כרגע — נסו שוב מאוחר יותר.',
                  en: 'AI is offline right now — try again later.',
                  ru: 'AI недоступен — попробуйте позже.',
                  ar: 'الذكاء الاصطناعي غير متاح — حاول لاحقًا.',
                  fr: 'IA hors ligne — réessayez plus tard.',
                },
                rate_limited: {
                  he: 'רגע — שאלה אחת כל כמה שניות.',
                  en: 'Slow down — one question every few seconds.',
                  ru: 'Не так быстро — один вопрос в несколько секунд.',
                  ar: 'مهلة — سؤال واحد كل عدة ثوانٍ.',
                  fr: 'Doucement — une question toutes les quelques secondes.',
                },
                listing_not_found: {
                  he: 'הדירה לא נמצאה.', en: 'Listing not found.',
                  ru: 'Объявление не найдено.', ar: 'العقار غير موجود.', fr: 'Annonce introuvable.',
                },
                listing_inactive: {
                  he: 'הדירה כבר לא פעילה.', en: 'This listing is no longer active.',
                  ru: 'Объявление больше не активно.', ar: 'العقار لم يعد نشطًا.', fr: 'Annonce inactive.',
                },
              }
              const localized = msgs[error]?.[lang]
              if (localized) return localized
              const fb: Record<string, string> = {
                he: `לא הצלחנו לענות (${error}).`,
                en: `Couldn't get an answer (${error}).`,
                ru: `Не удалось получить ответ (${error}).`,
                ar: `تعذر الحصول على إجابة (${error}).`,
                fr: `Impossible d'obtenir une réponse (${error}).`,
              }
              return fb[lang] ?? fb.en
            })()}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-100 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          maxLength={500}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length < 2}
          className="px-4 py-2 bg-brand-blue hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition whitespace-nowrap"
        >
          {sendLabel}
        </button>
      </form>
    </div>
  )
}
