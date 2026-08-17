import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { trackEvent } from '../components/GoogleAnalytics'
import { getFirstTouch } from '../lib/acquisition'

type Role = 'buyer' | 'agent' | 'seller'

export default function Register() {
  useSeo({
    title: 'Create account',
    description: 'Create a free BebKey account to save listings, set up search alerts, and contact agents.',
  })
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { startGoogleLogin } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Role>('buyer')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const roles: { value: Role; label: string }[] = [
    { value: 'buyer',  label: t('auth.roleBuyer') },
    { value: 'agent',  label: t('auth.roleAgent') },
    { value: 'seller', label: t('auth.roleSeller') },
  ]

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }

    // ── Email validation via Abstract API ────────────────────────────────────
    setLoading(true)
    const abstractKey = import.meta.env.VITE_ABSTRACT_EMAIL_KEY
    if (abstractKey) {
      try {
        const res = await fetch(
          `https://emailvalidation.abstractapi.com/v1/?api_key=${abstractKey}&email=${encodeURIComponent(email)}`
        )
        const ev = await res.json()
        const isDisposable   = ev?.is_disposable_email?.value === true
        const isUndeliverable = ev?.deliverability === 'UNDELIVERABLE'
        const isInvalidFormat = ev?.is_valid_format?.value === false

        if (isInvalidFormat) {
          setLoading(false)
          setError(t('auth.emailInvalid', 'Please enter a valid email address.'))
          return
        }
        if (isDisposable) {
          setLoading(false)
          setError(t('auth.emailDisposable', 'Disposable email addresses are not allowed. Please use a real email.'))
          return
        }
        if (isUndeliverable) {
          setLoading(false)
          setError(t('auth.emailUndeliverable', 'This email address does not appear to exist. Please check and try again.'))
          return
        }
      } catch {
        // Validation API unreachable - allow signup to proceed
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      // Attribute this signup to where the visitor first arrived from
      // (utm / referrer captured on first visit). Fire-and-forget; the
      // acquisitions insert policy allows anon so it works even when email
      // confirmation is on and there's no session yet.
      if (data.user?.id) {
        const ft = getFirstTouch()
        void supabase.from('acquisitions').insert({
          user_id: data.user.id,
          source: ft?.source ?? 'direct',
          medium: ft?.medium ?? 'direct',
          campaign: ft?.campaign ?? null,
          referrer: ft?.referrer ?? null,
          landing_path: ft?.landing_path ?? null,
        }).then(() => {}, () => { /* non-fatal */ })
      }

      // Send welcome email (fire-and-forget - don't block the UI).
      // Pass `role` so the edge function can pick the buyer-vs-agent
      // version of the welcome template (different first-step CTAs).
      supabase.functions.invoke('send-email', {
        body: {
          type: 'welcome',
          data: { email, name: '', role, lang: i18n.language },
        },
      }).catch(() => { /* non-fatal */ })

      // GA4 conversion event - tracks sign_up for ad attribution / funnels
      trackEvent('sign_up', { method: 'email', role })

      if (data.session) {
        // Email confirmation is disabled - user is already logged in
        navigate('/dashboard')
      } else {
        setSuccess(true)
      }
    }
  }

  async function handleGoogleRegister() {
    setError('')
    const { error } = await startGoogleLogin()
    if (error) setError(error.message)
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t('auth.checkEmail')}</h2>
          <p className="text-gray-500 text-sm mb-6">
            {t('auth.confirmationSent')} <strong>{email}</strong>. {t('auth.clickToActivate')}
          </p>
          <Link to="/login" className="text-brand-blue font-medium hover:underline text-sm">
            {t('nav.login')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('auth.registerBtn')}</h1>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {/* Email */}
          <input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-11 text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {/* Confirm password */}
          <input
            type={showPass ? 'text' : 'password'}
            placeholder={t('auth.confirmPassword')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />

          {/* Role selector */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">{t('auth.role')}</p>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${
                    role === r.value
                      ? 'border-brand-blue bg-brand-blue text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-brand-blue/40'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-brand-blue text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? t('common.loading') : t('auth.registerBtn')}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google */}
        <div className="flex justify-center">
          <button
            onClick={handleGoogleRegister}
            aria-label="Continue with Google"
            className="border border-gray-300 rounded-lg p-3 hover:bg-gray-50 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.86l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 6.98 6.48 3.44 14.37l7.1 5.52C12.27 13.77 17.68 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.74H24v9h12.71c-.55 2.93-2.2 5.41-4.68 7.08l7.2 5.6C43.18 37.21 46.52 31.32 46.52 24.5z"/>
              <path fill="#FBBC05" d="M10.54 28.11A14.63 14.63 0 0 1 9.5 24c0-1.43.2-2.82.54-4.11l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.87.92 7.53 2.56 10.76l7.98-6.65z"/>
              <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.49-4.94l-7.2-5.6c-1.99 1.34-4.54 2.13-6.29 2.13-6.32 0-11.73-4.27-13.46-10.03l-7.98 6.65C6.98 41.52 14.82 47 24 47z"/>
            </svg>
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="text-brand-blue font-medium hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </div>
    </div>
  )
}
