/**
 * Google OAuth callback page - /auth/callback
 *
 * Google redirects here after the user picks an account.
 * We exchange the authorization code for a Supabase session
 * via the /api/auth/google-exchange Vercel serverless function,
 * then call supabase.auth.setSession() so the rest of the app
 * picks up the new user state automatically via onAuthStateChange.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const didRun = useRef(false)

  useEffect(() => {
    // StrictMode fires effects twice in dev - guard against double-exchange
    if (didRun.current) return
    didRun.current = true

    async function exchangeCode() {
      const params = new URLSearchParams(window.location.search)
      const code  = params.get('code')
      const state = params.get('state')

      const storedState    = sessionStorage.getItem('google_oauth_state')
      const codeVerifier   = sessionStorage.getItem('google_oauth_code_verifier')

      // Clean up regardless of outcome
      sessionStorage.removeItem('google_oauth_state')
      sessionStorage.removeItem('google_oauth_code_verifier')

      if (!code || !codeVerifier || state !== storedState) {
        console.error('AuthCallback: missing code/verifier or state mismatch')
        navigate('/login?error=auth_failed', { replace: true })
        return
      }

      try {
        const res = await fetch('/api/auth/google-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: codeVerifier }),
        })

        const data = await res.json()

        if (!res.ok || data.error) {
          console.error('AuthCallback: exchange failed', data)
          navigate('/login?error=auth_failed', { replace: true })
          return
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          console.error('AuthCallback: setSession failed', sessionError)
          navigate('/login?error=auth_failed', { replace: true })
          return
        }

        // onAuthStateChange in AuthContext will fire and set up the user -
        // navigate to dashboard (or any post-login destination).
        navigate('/dashboard', { replace: true })
      } catch (err) {
        console.error('AuthCallback: unexpected error', err)
        navigate('/login?error=auth_failed', { replace: true })
      }
    }

    exchangeCode()
  }, [navigate])

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <svg
          className="animate-spin w-8 h-8 text-brand-blue mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        <p className="text-gray-500 text-sm">Signing you in...</p>
      </div>
    </div>
  )
}
