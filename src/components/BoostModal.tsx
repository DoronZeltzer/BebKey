/**
 * BoostModal — lets an agent pick a paid boost for one of their listings.
 *
 * The catalog comes from src/lib/boosts.ts. Clicking a price calls onBuy(type);
 * the parent decides what happens (Lemon Squeezy one-time checkout once
 * payments are live; a "coming soon" notice until then).
 */
import { useTranslation } from 'react-i18next'
import { BOOST_LIST, boostName, boostDesc } from '../lib/boosts'
import type { BoostType } from '../lib/boosts'

interface Props {
  onClose: () => void
  onBuy: (type: BoostType) => void
  /** Optional note shown under the title (e.g. "coming soon"). */
  note?: string
}

export default function BoostModal({ onClose, onBuy, note }: Props) {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const he = lang === 'he'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900">{he ? 'בוסט למודעה' : 'Boost this listing'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {he ? 'יותר חשיפה, יותר פניות. תשלום חד-פעמי.' : 'More exposure, more leads. One-time payment.'}
        </p>

        {note && (
          <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            {note}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {BOOST_LIST.map(b => (
            <div
              key={b.type}
              className="border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-brand-blue/50 transition-colors"
            >
              <div className="text-2xl shrink-0">{b.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{boostName(b, lang)}</span>
                  <span className="text-xs text-gray-400">· {b.days} {he ? 'ימים' : 'days'}</span>
                </div>
                <p className="text-xs text-gray-500">{boostDesc(b, lang)}</p>
              </div>
              <button
                onClick={() => onBuy(b.type)}
                className="shrink-0 bg-brand-blue text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-blue-700"
              >
                ₪{b.price}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
