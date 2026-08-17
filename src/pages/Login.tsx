import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmailValidator } from '../hooks/useEmailValidator'
import { useSeo } from '../hooks/useSeo'

export default function Login() {
  useSeo({
    title: 'Sign in',
    description: 'Sign in to BebKey to access your saved listings, search alerts, and agent dashboard.',
  })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, startGoogleLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { status, message, validate } = useEmailValidator()

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value)
    validate(e.target.value)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'invalid') return
    setError('')
    setLoading(true)
    // login() claims this device's session - any other logged-in device is kicked out
    const { error } = await login(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/dashboard')
    }
  }

  async function handleGoogleLogin() {
    setError('')
    // startGoogleLogin() sets the OAuth flag so this device claims the session on return
    const { error } = await startGoogleLogin()
    if (error) setError(error.message)
  }

  // Border colour based on status
  const inputBorder =
    status === 'valid'   ? 'border-green-400 focus:ring-green-400' :
    status === 'invalid' ? 'border-red-400 focus:ring-red-400' :
    status === 'checking'? 'border-yellow-400 focus:ring-yellow-400' :
                           'border-gray-300 focus:ring-brand-blue'

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('nav.login')}</h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">

          {/* Email field with status indicator */}
          <div className="flex flex-col gap-1">
            <div className="relative">
              <input
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={handleEmailChange}
                required
                className={`w-full border rounded-lg px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 transition-colors ${inputBorder}`}
              />
              {/* Status icon */}
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                {status === 'checking' && (
                  <svg className="animate-spin w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                )}
                {status === 'valid'   && <span className="text-green-500">✓</span>}
                {status === 'invalid' && <span className="text-red-500">✗</span>}
              </span>
            </div>
            {/* Status message */}
            {message && (
              <p className={`text-xs ${
                status === 'valid'    ? 'text-green-500' :
                status === 'invalid' ? 'text-red-500' :
                                       'text-yellow-500'
              }`}>
                {message}
              </p>
            )}
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-11 text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                // Eye-off icon
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                // Eye icon
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || status === 'invalid'}
            className="bg-brand-blue text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? t('common.loading') : t('auth.loginBtn')}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google login button - icon only */}
        <div className="flex justify-center">
          <button
            onClick={handleGoogleLogin}
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
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-brand-blue font-medium hover:underline">
            {t('nav.register')}
          </Link>
        </p>
      </div>
    </div>
  )
}
