import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function CheckoutCancel() {
  const { t } = useTranslation()
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        {t('checkoutCancel.title')}
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        {t('checkoutCancel.body')}
      </p>
      <div className="flex gap-3 justify-center">
        <Link
          to="/pricing"
          className="px-5 py-2.5 bg-brand-blue text-white font-semibold rounded-xl text-sm hover:bg-blue-700 transition"
        >
          {t('checkoutCancel.viewPlans')}
        </Link>
        <Link
          to="/dashboard"
          className="px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 transition"
        >
          {t('checkoutCancel.backToDashboard')}
        </Link>
      </div>
    </div>
  )
}
