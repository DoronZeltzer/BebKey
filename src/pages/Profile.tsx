import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getUserSubscription, isSubscriptionActive, type UserSubscription } from '../lib/subscriptions'
import { useSeo } from '../hooks/useSeo'

type Role = 'buyer' | 'agent' | 'seller'

export default function Profile() {
  useSeo({
    title: 'Profile',
    description: 'Manage your BebKey profile, language, and notification preferences.',
  })
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState((user?.user_metadata?.full_name as string) ?? '')
  const [phone, setPhone]       = useState((user?.user_metadata?.phone as string) ?? '')
  const [role, setRole]         = useState<Role>((user?.user_metadata?.role as Role) ?? 'buyer')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  // Subscription
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  useEffect(() => {
    if (user) getUserSubscription(user.id).then(setSubscription)
  }, [user])

  // Notification prefs
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [matchAlerts, setMatchAlerts] = useState(true)

  // Billing management. Grow standing orders (הוראת קבע) have no self-serve
  // customer portal — the merchant cancels them in the Grow dashboard. So we
  // send a cancellation request to support; the plan stays active until the end
  // of the paid period.
  const [cancelling, setCancelling] = useState(false)
  const [cancelMsg, setCancelMsg] = useState('')
  async function handleCancelSubscription() {
    setCancelling(true); setCancelMsg('')
    try {
      const subject = 'Cancel my BebKey subscription'
      const bodyText = `Hi,\n\nPlease cancel my subscription${subscription?.plan ? ` (${subscription.plan})` : ''}.\n\nAccount email: ${user?.email || ''}\n`
      window.open(
        `mailto:support@bebkey.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`,
        '_blank',
      )
      setCancelMsg(t(
        'profile.cancelRequested',
        "We've opened an email to support@bebkey.com — send it and we'll cancel your subscription. It stays active until the end of your paid period.",
      ))
    } catch (e: any) {
      setCancelMsg(e?.message || 'Network error')
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase.auth.updateUser({
      data: { full_name: fullName, phone, role },
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t('profile.deleteConfirm'))) return
    await signOut()
    navigate('/')
  }

  const roles: { value: Role; label: string; desc: string }[] = [
    { value: 'buyer',  label: t('auth.roleBuyer'),  desc: t('profile.roleBuyerDesc') },
    { value: 'agent',  label: t('auth.roleAgent'),  desc: t('profile.roleAgentDesc') },
    { value: 'seller', label: t('auth.roleSeller'), desc: t('profile.roleSellerDesc') },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-brand-blue rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {(fullName || user?.email || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('profile.title')}</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">

        {/* Personal info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-base">{t('profile.personalInfo')}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('profile.fullName')}</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder={t('profile.yourName')}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{t('profile.phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="05X-XXXXXXX"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{t('auth.email')}</label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Role */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-base">{t('profile.accountRole')}</h2>
          <div className="flex flex-col gap-2">
            {roles.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  role === r.value
                    ? 'border-brand-blue bg-brand-blue/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  role === r.value ? 'border-brand-blue' : 'border-gray-300'
                }`}>
                  {role === r.value && <div className="w-2 h-2 bg-brand-blue rounded-full" />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${role === r.value ? 'text-brand-blue' : 'text-gray-700'}`}>{r.label}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Notification prefs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-base">{t('profile.notifications')}</h2>
          <div className="flex flex-col gap-3">
            {[
              { label: t('profile.emailNotifs'), desc: t('profile.emailNotifsDesc'), value: emailNotifs, onChange: setEmailNotifs },
              { label: t('profile.matchAlerts'), desc: t('profile.matchAlertsDesc'), value: matchAlerts, onChange: setMatchAlerts },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => item.onChange(!item.value)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${item.value ? 'bg-brand-blue' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.value ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-brand-blue text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? t('profile.saving') : saved ? t('profile.savedOk') : t('profile.saveChanges')}
        </button>
      </form>

      {/* Subscription status */}
      {subscription !== null && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 text-base mb-4">{t('profile.subscription')}</h2>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700 capitalize">
                {subscription.plan
                  ? `${subscription.plan.charAt(0).toUpperCase()}${subscription.plan.slice(1)} plan`
                  : t('profile.noPlan')}
              </p>
              <p className={`text-xs mt-0.5 font-semibold ${
                isSubscriptionActive(subscription.status)
                  ? 'text-green-600'
                  : subscription.status === 'trialing'
                  ? 'text-blue-600'
                  : 'text-amber-600'
              }`}>
                {subscription.status === 'active'   ? t('profile.subActive')   :
                 subscription.status === 'trialing' ? t('profile.subTrialing') :
                 subscription.status === 'canceled' ? t('profile.subCanceled') :
                 subscription.status === 'paused'   ? t('profile.subPaused')   :
                 t('profile.noPlan')}
              </p>
              {subscription.current_period_ends_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {subscription.status === 'canceled'
                    ? t('profile.accessUntil')
                    : t('profile.renewsOn')}{' '}
                  {new Date(subscription.current_period_ends_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Link
              to="/pricing"
              className="px-4 py-2 bg-brand-blue text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isSubscriptionActive(subscription.status)
                ? t('profile.managePlan')
                : t('profile.upgradePlan')}
            </Link>
          </div>

          {/* Self-cancel — only show while the sub is still active/trialing.
              Once cancelled, the badge above already says so, so no button. */}
          {isSubscriptionActive(subscription.status) && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-gray-500 max-w-md">
                {t('profile.cancelExplain', 'Cancelling stops the next renewal. You keep access until the end of the current billing period.')}
              </p>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                {cancelling ? t('common.loading') : t('profile.cancelSubscription', 'Cancel subscription')}
              </button>
            </div>
          )}
          {cancelMsg && (
            <p className="mt-3 text-xs text-gray-600">{cancelMsg}</p>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-8 bg-white rounded-2xl border border-red-100 shadow-sm p-6">
        <h2 className="font-semibold text-red-600 text-base mb-1">{t('profile.dangerZone')}</h2>
        <p className="text-xs text-gray-500 mb-4">{t('profile.dangerZoneDesc')}</p>
        <div className="flex gap-3">
          <button
            onClick={() => signOut().then(() => navigate('/'))}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            {t('profile.signOut')}
          </button>
          <button
            onClick={handleDeleteAccount}
            className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition"
          >
            {t('profile.deleteAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}
