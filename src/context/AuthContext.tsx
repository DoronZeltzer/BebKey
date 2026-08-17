import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { generateCodeVerifier, generateCodeChallenge } from '../lib/pkce'

const SESSION_KEY = 'bebkey_session_token'
const POLL_INTERVAL_MS = 10_000

/**
 * True while claimSession's DB upsert is in-flight.
 * isSessionValid checks this flag to avoid a race where INITIAL_SESSION captures
 * a stale localStorage value before SIGNED_IN's claimSession updates both
 * localStorage AND the DB, causing a false mismatch → spurious forceSignOut.
 */
let isClaimingSession = false

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  kickedOut: boolean
  login: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  startGoogleLogin: () => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  kickedOut: false,
  login: async () => ({ error: null }),
  signOut: async () => {},
  startGoogleLogin: async () => ({ error: null }),
})

/** Write a new session token to Supabase and localStorage - this device wins. */
async function claimSession(userId: string): Promise<void> {
  isClaimingSession = true
  const token = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, token)
  try {
    const { error } = await supabase.from('user_sessions').upsert(
      { user_id: userId, session_token: token, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (error) {
      console.warn('[BebKey] claimSession failed (login will still work):', error.message)
    }
  } finally {
    isClaimingSession = false
  }
}

/** Returns true if the token in localStorage still matches the DB. */
async function isSessionValid(userId: string): Promise<boolean> {
  // If claimSession is actively writing new tokens, bail out early.
  // Comparing mid-flight would always produce a false mismatch.
  if (isClaimingSession) return true

  const local = localStorage.getItem(SESSION_KEY)
  if (!local) {
    // No local token means this device has never claimed a session yet
    // (e.g. fresh OAuth login - INITIAL_SESSION fires before SIGNED_IN sets the token).
    // Don't kick out; SIGNED_IN will call claimSession and set the token shortly.
    return true
  }
  const { data, error } = await supabase
    .from('user_sessions')
    .select('session_token')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    // Table unavailable - fail open so the user stays logged in
    console.warn('[BebKey] isSessionValid error (staying logged in):', error.message)
    return true
  }
  if (!data) {
    // No DB row yet - claimSession may not have run yet. Stay logged in.
    return true
  }

  // After the async DB round-trip, claimSession may have started (SIGNED_IN fires
  // concurrently with INITIAL_SESSION's await).  If it's now in-flight, stay logged in.
  if (isClaimingSession) return true

  // Re-read localStorage after the await: claimSession may have updated it while we
  // were waiting for the DB response, making the value we captured above stale.
  const currentLocal = localStorage.getItem(SESSION_KEY)
  if (!currentLocal) return true  // Token was removed during the await - OK

  // Only kick out when the current local token EXISTS but doesn't match the DB
  // (meaning another device has since claimed this account).
  return data.session_token === currentLocal
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [kickedOut, setKickedOut] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function forceSignOut() {
    stopPolling()
    localStorage.removeItem(SESSION_KEY)
    await supabase.auth.signOut()
    setSession(null)
    setKickedOut(true)
  }

  function startPolling(userId: string) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const valid = await isSessionValid(userId)
      if (!valid) forceSignOut()
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    /**
     * Use onAuthStateChange as the single source of truth for session state.
     *
     * INITIAL_SESSION fires once when the listener is attached, AFTER Supabase has
     * finished processing any OAuth code/hash in the URL - so it's safe to use
     * instead of the racy getSession() call that was here before.
     *
     * SIGNED_IN fires for every new login (email/password OR OAuth redirect).
     * We call claimSession fire-and-forget so the UI isn't blocked waiting for the DB.
     */
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {

      if (event === 'INITIAL_SESSION') {
        if (newSession?.user) {
          const valid = await isSessionValid(newSession.user.id)
          if (!valid) {
            // Another device claimed this account - kick this one out
            await forceSignOut()
          } else {
            setSession(newSession)
            startPolling(newSession.user.id)
          }
        }
        setLoading(false)
        return
      }

      if (event === 'SIGNED_IN' && newSession?.user) {
        setKickedOut(false)
        // Claim session for this device (works for both email/password and OAuth).
        // Fire-and-forget - don't await, so the UI isn't blocked.
        claimSession(newSession.user.id)
        setSession(newSession)
        setLoading(false)
        startPolling(newSession.user.id)
      }

      if (event === 'SIGNED_OUT') {
        stopPolling()
        localStorage.removeItem(SESSION_KEY)
        setSession(null)
        setLoading(false)
      }

      if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession)
      }
    })

    // Re-check when the tab regains focus
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.user) {
            isSessionValid(data.session.user.id).then(valid => {
              if (!valid) forceSignOut()
            })
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      listener.subscription.unsubscribe()
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Email/password login.
   * claimSession is now handled inside the SIGNED_IN event handler above,
   * so this function only needs to call signInWithPassword.
   */
  async function login(email: string, password: string) {
    setKickedOut(false)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  /**
   * Kick off Google OAuth using a custom PKCE flow so that Google shows
   * "to continue to bebkey.com" instead of the raw Supabase project URL.
   *
   * Flow:
   *  1. Generate PKCE code_verifier + code_challenge and a random state.
   *  2. Store both in sessionStorage for the callback page.
   *  3. Redirect directly to Google's OAuth endpoint with
   *     redirect_uri = origin/auth/callback (bebkey.com).
   *  4. /auth/callback exchanges the code via /api/auth/google-exchange
   *     and calls supabase.auth.setSession() to complete the login.
   */
  async function startGoogleLogin() {
    setKickedOut(false)
    try {
      const codeVerifier   = generateCodeVerifier()
      const codeChallenge  = await generateCodeChallenge(codeVerifier)
      const state          = crypto.randomUUID()

      sessionStorage.setItem('google_oauth_code_verifier', codeVerifier)
      sessionStorage.setItem('google_oauth_state', state)

      const params = new URLSearchParams({
        client_id:             import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        redirect_uri:          `${window.location.origin}/auth/callback`,
        response_type:         'code',
        scope:                 'openid email profile',
        code_challenge:        codeChallenge,
        code_challenge_method: 'S256',
        state,
      })

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }

  async function signOut() {
    stopPolling()
    if (session?.user) {
      await supabase.from('user_sessions').delete().eq('user_id', session.user.id)
    }
    localStorage.removeItem(SESSION_KEY)
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, kickedOut, login, signOut, startGoogleLogin }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
